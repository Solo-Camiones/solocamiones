import type { Invoice, InvoiceLine, Payment, PaymentState } from '../../api/contracts/entities';

/** Included ITBIS rate — applied only when the invoice is fiscal and the line is taxable. */
export const ITBIS_INCLUDED_RATE = 0.18;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Final line price (tax-inclusive when fiscal). */
export function lineGross(line: InvoiceLine): number {
  return roundMoney(line.unitPrice * line.quantity);
}

/**
 * Included ITBIS extracted from the final price.
 * Non-fiscal invoices and non-taxable lines (service/delivery) yield 0.
 */
export function lineItbis(line: InvoiceLine, fiscal: boolean): number {
  if (!fiscal || !line.taxable) {
    return 0;
  }

  const gross = lineGross(line);
  const base = roundMoney(gross / (1 + ITBIS_INCLUDED_RATE));
  return roundMoney(gross - base);
}

export function invoiceTotal(invoice: Invoice): number {
  return roundMoney(invoice.lines.reduce((sum, line) => sum + lineGross(line), 0));
}

export function isRefund(payment: Payment): boolean {
  return payment.kind === 'REFUND';
}

export function invoicePaid(invoice: Invoice): number {
  return roundMoney(
    invoice.payments
      .filter((payment) => !isRefund(payment))
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
}

export function invoiceRefunded(invoice: Invoice): number {
  return roundMoney(
    invoice.payments
      .filter((payment) => isRefund(payment))
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
}

export function lineBase(line: InvoiceLine, fiscal: boolean): number {
  const gross = lineGross(line);
  if (!fiscal || !line.taxable) {
    return gross;
  }

  return roundMoney(gross / (1 + ITBIS_INCLUDED_RATE));
}

export function invoiceItbis(invoice: Invoice): number {
  return roundMoney(
    invoice.lines.reduce((sum, line) => sum + lineItbis(line, invoice.fiscal), 0),
  );
}

/** Sum of already-rounded line bases. Non-fiscal and non-taxable lines use gross as base. */
export function invoiceTaxableBase(invoice: Invoice): number {
  return roundMoney(
    invoice.lines.reduce((sum, line) => sum + lineBase(line, invoice.fiscal), 0),
  );
}

/**
 * Derives Unpaid / Partially Paid / Paid from the receipt ledger.
 * Seed FAC-000096 is marked PAID without rows; that marker is kept until a ledger exists.
 */
export function derivePaymentState(invoice: Invoice): PaymentState {
  const paid = invoicePaid(invoice);
  const total = invoiceTotal(invoice);

  if (invoice.payments.length === 0 && invoice.paymentState === 'PAID') {
    return 'PAID';
  }

  if (paid <= 0) {
    return 'UNPAID';
  }

  if (paid + Number.EPSILON >= total) {
    return 'PAID';
  }

  return 'PARTIALLY_PAID';
}

export function hasRecordedReceipts(invoice: Invoice): boolean {
  return invoicePaid(invoice) > 0 || invoice.paymentState === 'PAID';
}

/**
 * Remaining customer balance for a completed invoice.
 * Relies on `paymentState` so a seed marked PAID without payment rows is not treated as CxC.
 */
export function invoiceBalance(invoice: Invoice): number {
  if (invoice.status !== 'COMPLETED' || invoice.paymentState === 'PAID') {
    return 0;
  }

  return roundMoney(invoiceTotal(invoice) - invoicePaid(invoice));
}

export function utcCalendarDate(iso: string): string {
  return iso.slice(0, 10);
}
