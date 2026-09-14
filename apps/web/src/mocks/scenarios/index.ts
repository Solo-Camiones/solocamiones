import type { AppState } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { addDraftLine, createDraft, discardDraft, setDraftMeta } from '../services/sales-pos-commands';

export type DemoScenario = {
  id: number;
  slug: string;
  title: string;
  description: string;
  suggestedUsername: string;
  suggestedPassword: string;
  nextPath: string;
  nextSteps: string;
};

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 1,
    slug: 'installed-piece-sale',
    title: 'Venta de pieza instalada',
    description: 'Confirmar venta con pieza instalada y orden de desmonte automática.',
    suggestedUsername: 'laura',
    suggestedPassword: 'demo1234',
    nextPath: '/sales/draft/INV-DRAFT-01',
    nextSteps:
      'Inicie sesión como laura. Abra el borrador INV-DRAFT-01 (ALT-004 instalado) y confirme.',
  },
  {
    id: 2,
    slug: 'manual-dismantling',
    title: 'Desmonte manual',
    description: 'Crear orden de desmonte sin venta (admin).',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/work-orders',
    nextSteps:
      'Inicie sesión como admin. Cree una orden de desmonte manual sobre una pieza instalada.',
  },
  {
    id: 3,
    slug: 'installation',
    title: 'Instalación de pieza',
    description: 'Orden de instalación y jerarquía física.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/work-orders/OD-DEMO-062',
    nextSteps: 'Inicie sesión como admin. Revise OD-DEMO-062 (instalación de FIL-001 en MOT-002).',
  },
  {
    id: 4,
    slug: 'initial-motor-registration',
    title: 'Registro inicial de motor',
    description: 'Alta de ensamblaje con registro inicial de componentes.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/inventory',
    nextSteps:
      'Inicie sesión como admin. Inventario → Registrar ensamblaje con el registro inicial de componentes.',
  },
  {
    id: 5,
    slug: 'full-assembly-sale',
    title: 'Venta de ensamblaje completo',
    description: 'Vender un ensamblaje completo desde el punto de venta.',
    suggestedUsername: 'laura',
    suggestedPassword: 'demo1234',
    nextPath: '/sales/draft/INV-DRAFT-01',
    nextSteps:
      'Inicie sesión como laura. Abra el borrador limpio, asigne precio a MOT-003 y confirme la venta.',
  },
  {
    id: 6,
    slug: 'no-desarmar-blocked',
    title: 'Venta bloqueada por No desarmar',
    description: 'Intento de línea suelta bajo MOT-003.',
    suggestedUsername: 'laura',
    suggestedPassword: 'demo1234',
    nextPath: '/inventory/ALT-011',
    nextSteps:
      'Inicie sesión como laura. Agregar ALT-011 al borrador debe rechazarse (No desarmar).',
  },
  {
    id: 7,
    slug: 'partial-payments',
    title: 'Pago parcial y múltiple',
    description: 'Registrar pagos parciales en factura confirmada.',
    suggestedUsername: 'laura',
    suggestedPassword: 'demo1234',
    nextPath: '/sales/INV-098',
    nextSteps: 'Inicie sesión como laura. Cobre FAC-000098 en varios pagos sin superar el saldo.',
  },
  {
    id: 8,
    slug: 'cancel-pending-wo',
    title: 'Cancelación con orden pendiente',
    description: 'Cancelar factura con orden de trabajo aún pendiente.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/sales/INV-098',
    nextSteps: 'Inicie sesión como admin. Cancele FAC-000098 (OD-DEMO-061 Pendiente).',
  },
  {
    id: 9,
    slug: 'cancel-in-progress-wo',
    title: 'Cancelación con orden en proceso',
    description: 'Cancelar factura con orden de trabajo en proceso.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/sales/INV-096',
    nextSteps:
      'Inicie sesión como admin. Cancele FAC-000096 (OD-DEMO-060 En proceso: STOP o CONTINUE).',
  },
  {
    id: 10,
    slug: 'cancel-after-dismantling',
    title: 'Cancelación después de desmonte completado',
    description: 'Rama de cancelación posterior al desmonte.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/work-orders/OD-DEMO-063',
    nextSteps:
      'Inicie sesión como admin. OD-DEMO-063 ya está Completada; use una factura con el desmonte realizado.',
  },
  {
    id: 11,
    slug: 'usd-profitability-pending',
    title: 'Venta en dólares con rentabilidad pendiente',
    description: 'FAC-000096 hasta activar la tasa de cambio y reintentar.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/profitability',
    nextSteps:
      'Inicie sesión como admin. FAC-000096 sigue pendiente de tasa de cambio hasta activarla y reintentar.',
  },
  {
    id: 12,
    slug: 'admin-recovery',
    title: 'Recuperación administrativa',
    description: 'Liberar reservas y reintentar cálculos.',
    suggestedUsername: 'admin',
    suggestedPassword: 'demo1234',
    nextPath: '/recovery',
    nextSteps:
      'Inicie sesión como admin. Libere INV-DRAFT-01 y reintente rentabilidad en dólares si aplica.',
  },
] as const;

function requireItem(state: AppState, id: string): Result<void> {
  if (!state.items.some((item) => item.id === id)) {
    return err({ code: 'CONFLICT', message: `El seed no incluye ${id}` });
  }
  return ok(undefined);
}

function prepareFullAssemblySale(state: AppState): Result<void> {
  const administrator = state.users.find((user) => user.id === 'U-ADMIN');
  const seller = state.users.find((user) => user.id === 'U-LAURA');
  if (!administrator || !seller) {
    return err({ code: 'CONFLICT', message: 'Faltan usuarios demo para preparar la venta' });
  }

  for (const draft of state.invoices.filter((invoice) => invoice.status === 'DRAFT')) {
    const discarded = discardDraft(state, administrator, draft.id);
    if (!discarded.ok) {
      return discarded;
    }
  }

  const assembly = requireItem(state, 'MOT-003');
  if (!assembly.ok) {
    return assembly;
  }

  const created = createDraft(state, seller);
  if (!created.ok) {
    return created;
  }

  const added = addDraftLine(state, seller, {
    draftId: created.value.draftId,
    type: 'ITEM',
    itemId: 'MOT-003',
  });
  if (!added.ok) {
    return added;
  }

  const assigned = setDraftMeta(state, seller, {
    draftId: created.value.draftId,
    customerId: 'C1',
  });
  if (!assigned.ok) {
    return assigned;
  }

  return ok(undefined);
}

/**
 * Each scenario resets to seed and checks the walkthrough still has its starting records.
 */
export function applyDemoScenario(state: AppState, scenarioId: number): Result<void> {
  switch (scenarioId) {
    case 1:
      if (state.items.find((item) => item.id === 'ALT-004')?.reservedByDraftId !== 'INV-DRAFT-01') {
        return err({ code: 'CONFLICT', message: 'ALT-004 debe estar reservado en INV-DRAFT-01' });
      }
      return ok(undefined);
    case 2:
    case 4:
      return requireItem(state, 'MOT-001');
    case 3:
      if (!state.workOrders.some((order) => order.id === 'OD-DEMO-062')) {
        return err({ code: 'CONFLICT', message: 'Falta OD-DEMO-062' });
      }
      return ok(undefined);
    case 5:
      return prepareFullAssemblySale(state);
    case 6: {
      const engine = state.items.find((item) => item.id === 'MOT-003');
      if (!engine?.noDesarmar) {
        return err({ code: 'CONFLICT', message: 'MOT-003 debe tener No desarmar' });
      }
      return ok(undefined);
    }
    case 7:
    case 8:
      if (!state.invoices.some((invoice) => invoice.number === 'FAC-000098')) {
        return err({ code: 'CONFLICT', message: 'Falta FAC-000098' });
      }
      return ok(undefined);
    case 9:
    case 11:
      if (
        state.invoices.find((invoice) => invoice.number === 'FAC-000096')
          ?.profitabilityPendingFx !== true
      ) {
        return err({
          code: 'CONFLICT',
          message: 'FAC-000096 debe estar pendiente de tasa de cambio',
        });
      }
      return ok(undefined);
    case 10:
      if (
        !state.workOrders.some(
          (order) => order.id === 'OD-DEMO-063' && order.status === 'COMPLETED',
        )
      ) {
        return err({ code: 'CONFLICT', message: 'Falta OD-DEMO-063 Completada' });
      }
      return ok(undefined);
    case 12:
      if (state.items.find((item) => item.id === 'ALT-004')?.reservedByDraftId !== 'INV-DRAFT-01') {
        return err({ code: 'CONFLICT', message: 'La reserva de INV-DRAFT-01 no está en el seed' });
      }
      return ok(undefined);
    default:
      return err({ code: 'NOT_FOUND', message: 'Escenario demo no encontrado' });
  }
}
