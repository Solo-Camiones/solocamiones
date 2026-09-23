import type {
  RecordManualGrossProfitInput,
  RetryUsdProfitabilityInput,
  SetFxAvailableInput,
} from '../../api/contracts/profitability';
import type { AppEvent, AppState, Invoice, User } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { can } from '../../shared/auth/policies';
import { DEMO_NOW_ISO } from '../data/demo-clock';
import { roundMoney } from './invoice-money';
import { canRecordManualGrossProfit } from './profitability-view';
import { applyUsdProfitability } from './usd-profitability';

function nextNumericId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);

  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

function appendEvent(
  state: AppState,
  type: string,
  description: string,
  actor: User,
  metadata?: Record<string, unknown>,
): AppEvent {
  const event: AppEvent = {
    id: nextNumericId(
      state.events.map((entry) => entry.id),
      'EV-',
      3,
    ),
    type,
    description,
    actorId: actor.id,
    createdAt: DEMO_NOW_ISO,
    metadata,
  };
  state.events.push(event);
  return event;
}

function requireAdminProfit(actor: User): Result<void> {
  if (!can(actor, 'profit.view')) {
    return err({ code: 'FORBIDDEN', message: 'No tiene permiso para realizar esta acción' });
  }
  return ok(undefined);
}

/**
 * Demo-only FX toggle. Does not recalculate existing USD results (COST-003 live-rate isolation).
 */
export function setFxAvailable(
  state: AppState,
  actor: User,
  input: SetFxAvailableInput,
): Result<AppState> {
  const allowed = requireAdminProfit(actor);
  if (!allowed.ok) {
    return allowed;
  }

  const previous = state.fxAvailable;
  state.fxAvailable = input.available;

  appendEvent(
    state,
    'DEMO_FX_TOGGLED',
    input.available ? 'Tasa de cambio de demostración activada' : 'Tasa de cambio de demostración desactivada',
    actor,
    { fxAvailableBefore: previous, fxAvailableAfter: input.available },
  );

  return ok(state);
}

/**
 * Named retry for PENDING FX RATE. Must not rerun the sale or touch payments/inventory.
 */
export function retryUsdProfitability(
  state: AppState,
  actor: User,
  input: RetryUsdProfitabilityInput,
): Result<Invoice> {
  const allowed = requireAdminProfit(actor);
  if (!allowed.ok) {
    return allowed;
  }

  const invoice = state.invoices.find((entry) => entry.id === input.invoiceId);
  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'Factura no encontrada' });
  }

  if (
    (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') ||
    invoice.currency !== 'USD'
  ) {
    return err({
      code: 'VALIDATION',
      message: 'Solo se puede reintentar rentabilidad en ventas en dólares reconocidas',
    });
  }

  if (invoice.profitabilityPendingFx !== true) {
    return err({
      code: 'CONFLICT',
      message: 'Esta venta no tiene rentabilidad pendiente de tasa de cambio',
    });
  }

  const paymentsBefore = invoice.payments.length;
  const statusBefore = invoice.status;
  const numberBefore = invoice.number;
  const outcome = applyUsdProfitability(state, invoice);

  if (invoice.payments.length !== paymentsBefore || invoice.status !== statusBefore || invoice.number !== numberBefore) {
    return err({
      code: 'INTERNAL',
      message: 'El reintento no debe alterar el estado comercial',
    });
  }

  if (outcome === 'PENDING_FX') {
    return err({
      code: 'VALIDATION',
      message: 'Tasa de cambio no disponible. Active la tasa de cambio de demostración y reintente.',
    });
  }

  const number = invoice.number ?? invoice.conduceNumber ?? invoice.id;

  appendEvent(
    state,
    'PROFITABILITY_RETRIED',
    outcome === 'CALCULATED'
      ? `Rentabilidad en dólares calculada para ${number}`
      : `Rentabilidad en dólares no disponible por costo desconocido en ${number}`,
    actor,
    {
      invoiceId: invoice.id,
      outcome,
      rateDopPerUsd: invoice.fxRateDopPerUsd,
      fxSource: invoice.fxSource,
    },
  );

  return ok(invoice);
}

/**
 * Records administrator-judged DOP gross profit when the system cannot calculate it.
 * Does not invent acquisition cost, change FX pending invoices, or touch commercial state.
 */
export function recordManualGrossProfit(
  state: AppState,
  actor: User,
  input: RecordManualGrossProfitInput,
): Result<Invoice> {
  const allowed = requireAdminProfit(actor);
  if (!allowed.ok) {
    return allowed;
  }

  if (!Number.isFinite(input.profitDop)) {
    return err({ code: 'VALIDATION', message: 'La ganancia bruta debe ser un número válido' });
  }

  const invoice = state.invoices.find((entry) => entry.id === input.invoiceId);
  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'Factura no encontrada' });
  }

  if (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') {
    return err({
      code: 'VALIDATION',
      message: 'Solo se puede registrar ganancia bruta en ventas reconocidas',
    });
  }

  if (invoice.profitabilityPendingFx === true) {
    return err({
      code: 'CONFLICT',
      message: 'Reintente primero el cálculo con la tasa de cambio; no registre un monto mientras esté pendiente',
    });
  }

  if (!canRecordManualGrossProfit(invoice, state)) {
    return err({
      code: 'CONFLICT',
      message: 'Esta factura ya tiene ganancia bruta calculada a partir del costo',
    });
  }

  const paymentsBefore = invoice.payments.length;
  const statusBefore = invoice.status;
  const numberBefore = invoice.number;
  const linesBefore = invoice.lines.length;
  const before = invoice.manualGrossProfitDop ?? null;
  const profitDop = roundMoney(input.profitDop);

  invoice.manualGrossProfitDop = profitDop;
  invoice.manualGrossProfitAt = DEMO_NOW_ISO;

  if (
    invoice.payments.length !== paymentsBefore ||
    invoice.status !== statusBefore ||
    invoice.number !== numberBefore ||
    invoice.lines.length !== linesBefore
  ) {
    return err({
      code: 'INTERNAL',
      message: 'El registro de ganancia no debe alterar el estado comercial',
    });
  }

  const number = invoice.number ?? invoice.conduceNumber ?? invoice.id;
  appendEvent(
    state,
    'GROSS_PROFIT_RECORDED',
    `Ganancia bruta registrada para ${number}`,
    actor,
    {
      invoiceId: invoice.id,
      before,
      after: profitDop,
    },
  );

  return ok(invoice);
}
