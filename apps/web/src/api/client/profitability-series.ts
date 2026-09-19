import type {
  CollectedByMethodPoint,
  ProfitabilityChartPoint,
  ProfitabilityCharts,
  SaleCondition,
} from '../contracts/profitability';
import type { InvoiceStatus } from '../contracts/entities';

export const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';

export type PaymentCollectionMethod = 'CASH' | 'TRANSFER' | 'CHECK';

const COLLECTION_METHODS: readonly PaymentCollectionMethod[] = ['CASH', 'TRANSFER', 'CHECK'];

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_LABEL = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

const MONTH_LABEL = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

export type ProfitabilitySeriesReceipt = {
  kind: 'PAYMENT' | 'REFUND';
  amount: number;
  method: PaymentCollectionMethod;
  effectiveDate: string;
};

export type ProfitabilitySeriesInvoice = {
  status: InvoiceStatus;
  currency: 'DOP' | 'USD';
  confirmedAt: string | null;
  /** Commercial condition at confirmation; required for COMPLETED invoiced KPIs. */
  saleCondition: SaleCondition | null;
  /** Invoice gross in invoice currency; converted to DOP when building invoiced series. */
  gross: number;
  profit: number | null;
  pendingFx: boolean;
  rateDopPerUsd: number | null;
  receipts: readonly ProfitabilitySeriesReceipt[];
};

export type ProfitabilitySeriesResult = {
  collectedDop: number;
  invoicesMissingProfitCount: number;
  omittedUsdReceiptCount: number;
  charts: ProfitabilityCharts | null;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function businessDateString(value: Date): string {
  const parts = BUSINESS_DATE.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function businessDateFromTimestamp(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return businessDateString(new Date(value));
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 12) return `${year + 1}-01`;
  return `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

function enumerateKeys(from: string, to: string, step: (key: string) => string): string[] {
  if (from > to) return [from];
  const keys = [from];
  let current = from;
  while (current < to) {
    current = step(current);
    keys.push(current);
  }
  return keys;
}

function utcNoon(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12));
}

function utcMonth(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
}

function storedRate(invoice: ProfitabilitySeriesInvoice): number | null {
  if (invoice.pendingFx) return null;
  const rate = invoice.rateDopPerUsd;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

function amountInDop(
  invoice: ProfitabilitySeriesInvoice,
  amount: number,
): { amount: number } | 'omit' {
  if (invoice.currency === 'DOP') return { amount };
  const rate = storedRate(invoice);
  if (rate == null) return 'omit';
  return { amount: amount * rate };
}

function receiptSignedDop(
  invoice: ProfitabilitySeriesInvoice,
  receipt: ProfitabilitySeriesReceipt,
): { amount: number } | 'omit' {
  const signed = receipt.kind === 'REFUND' ? -receipt.amount : receipt.amount;
  return amountInDop(invoice, signed);
}

function addAmount(bucket: Map<string, number>, key: string, amount: number) {
  bucket.set(key, (bucket.get(key) ?? 0) + amount);
}

function emptyMethodAmounts(): Record<PaymentCollectionMethod, number> {
  return { CASH: 0, TRANSFER: 0, CHECK: 0 };
}

function addMethodAmount(
  bucket: Map<string, Record<PaymentCollectionMethod, number>>,
  key: string,
  method: PaymentCollectionMethod,
  amount: number,
) {
  const current = bucket.get(key) ?? emptyMethodAmounts();
  current[method] = (current[method] ?? 0) + amount;
  bucket.set(key, current);
}

function toPoints(
  keys: string[],
  amounts: Map<string, number>,
  label: (key: string) => string,
): ProfitabilityChartPoint[] {
  return keys.map((key) => ({
    key,
    label: label(key),
    amount: roundMoney(amounts.get(key) ?? 0),
  }));
}

function toMethodPoints(
  keys: string[],
  amounts: Map<string, Record<PaymentCollectionMethod, number>>,
  label: (key: string) => string,
): CollectedByMethodPoint[] {
  return keys.map((key) => {
    const day = amounts.get(key) ?? emptyMethodAmounts();
    return {
      key,
      label: label(key),
      CASH: roundMoney(day.CASH),
      TRANSFER: roundMoney(day.TRANSFER),
      CHECK: roundMoney(day.CHECK),
    };
  });
}

function isCollectionMethod(value: string): value is PaymentCollectionMethod {
  return (COLLECTION_METHODS as readonly string[]).includes(value);
}

export function buildProfitabilitySeries(
  invoices: readonly ProfitabilitySeriesInvoice[],
  today = businessDateString(new Date()),
): ProfitabilitySeriesResult {
  const confirmedDays = invoices
    .filter(
      (invoice) =>
        (invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED') &&
        invoice.confirmedAt != null,
    )
    .map((invoice) => businessDateFromTimestamp(invoice.confirmedAt as string));

  const invoicesMissingProfitCount = invoices.filter(
    (invoice) => invoice.status === 'COMPLETED' && (invoice.profit == null || invoice.pendingFx),
  ).length;

  if (confirmedDays.length === 0) {
    return {
      collectedDop: 0,
      invoicesMissingProfitCount,
      omittedUsdReceiptCount: 0,
      charts: null,
    };
  }

  const fromDay = confirmedDays.reduce((left, right) => (left < right ? left : right), confirmedDays[0]);
  const toDay = today < fromDay ? fromDay : today;
  const dayKeys = enumerateKeys(fromDay, toDay, nextDay);
  const monthKeys = enumerateKeys(monthKey(fromDay), monthKey(toDay), nextMonth);

  const profitByDay = new Map<string, number>();
  const collectedByDay = new Map<string, number>();
  const invoicedCashByDay = new Map<string, number>();
  const invoicedCreditByDay = new Map<string, number>();
  const collectedByMethodByDay = new Map<string, Record<PaymentCollectionMethod, number>>();
  let omittedUsdReceiptCount = 0;

  for (const invoice of invoices) {
    // CANCELLED invoices are excluded from profit, invoiced, and collected KPIs.
    if (invoice.status !== 'COMPLETED') continue;

    if (invoice.profit != null && !invoice.pendingFx && invoice.confirmedAt) {
      addAmount(profitByDay, businessDateFromTimestamp(invoice.confirmedAt), invoice.profit);
    }

    if (invoice.confirmedAt && invoice.saleCondition != null) {
      const grossDop = amountInDop(invoice, invoice.gross);
      if (grossDop === 'omit') {
        // USD without a stored rate cannot enter DOP invoiced totals.
      } else {
        const day = businessDateFromTimestamp(invoice.confirmedAt);
        if (invoice.saleCondition === 'CASH') {
          addAmount(invoicedCashByDay, day, grossDop.amount);
        } else {
          addAmount(invoicedCreditByDay, day, grossDop.amount);
        }
      }
    }

    for (const receipt of invoice.receipts) {
      const converted = receiptSignedDop(invoice, receipt);
      if (converted === 'omit') {
        omittedUsdReceiptCount += 1;
        continue;
      }
      const day = businessDateFromTimestamp(receipt.effectiveDate);
      addAmount(collectedByDay, day, converted.amount);
      if (isCollectionMethod(receipt.method)) {
        addMethodAmount(collectedByMethodByDay, day, receipt.method, converted.amount);
      }
    }
  }

  const profitByMonth = new Map<string, number>();
  for (const [day, amount] of profitByDay) addAmount(profitByMonth, monthKey(day), amount);
  const collectedByMonth = new Map<string, number>();
  for (const [day, amount] of collectedByDay) addAmount(collectedByMonth, monthKey(day), amount);

  const collectedDop = roundMoney(
    [...collectedByDay.values()].reduce((sum, amount) => sum + amount, 0),
  );

  const dayLabel = (key: string) => DAY_LABEL.format(utcNoon(key));
  const monthLabel = (key: string) => MONTH_LABEL.format(utcMonth(key));

  return {
    collectedDop,
    invoicesMissingProfitCount,
    omittedUsdReceiptCount,
    charts: {
      fromDay,
      toDay,
      profitByDay: toPoints(dayKeys, profitByDay, dayLabel),
      profitByMonth: toPoints(monthKeys, profitByMonth, monthLabel),
      collectedByDay: toPoints(dayKeys, collectedByDay, dayLabel),
      collectedByMonth: toPoints(monthKeys, collectedByMonth, monthLabel),
      invoicedCashByDay: toPoints(dayKeys, invoicedCashByDay, dayLabel),
      invoicedCreditByDay: toPoints(dayKeys, invoicedCreditByDay, dayLabel),
      collectedByMethodByDay: toMethodPoints(dayKeys, collectedByMethodByDay, dayLabel),
    },
  };
}
