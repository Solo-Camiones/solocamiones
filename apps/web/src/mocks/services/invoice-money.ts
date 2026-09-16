import type { Invoice, InvoiceLine, Payment, PaymentState } from '../../api/contracts/entities';

/** Tax-exclusive ITBIS rate added per taxable line when applyItbis is on. */
export const ITBIS_RATE = 0.18;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineBase(line: InvoiceLine): number {
  if (line.base != null) return line.base;
  return roundMoney(line.unitPrice * line.quantity);
}

export function lineItbis(line: InvoiceLine, applyItbis: boolean): number {
  if (line.itbis != null) return line.itbis;
  if (!applyItbis || !line.taxable) {
    return 0;
  }

  return roundMoney(lineBase(line) * ITBIS_RATE);
}

export function lineGross(line: InvoiceLine, applyItbis: boolean): number {
  if (line.gross != null) return line.gross;
  return roundMoney(lineBase(line) + lineItbis(line, applyItbis));
}

export function invoiceTotal(invoice: Invoice): number {
  return roundMoney(
    invoice.lines.reduce((sum, line) => sum + lineGross(line, invoice.applyItbis === true), 0),
  );
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

export function invoiceItbis(invoice: Invoice): number {
  return roundMoney(
    invoice.lines.reduce((sum, line) => sum + lineItbis(line, invoice.applyItbis === true), 0),
  );
}

export function invoiceTaxableBase(invoice: Invoice): number {
  return roundMoney(invoice.lines.reduce((sum, line) => sum + lineBase(line), 0));
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
