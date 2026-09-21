import type { AppState, Invoice, InvoiceLine } from '../../api/contracts/entities';
import { invoiceTotal, roundMoney } from './invoice-money';

/**
 * Acquisition cost in DOP for a line, or null when cost is unknown.
 * Unknown cost must not be treated as zero (COST-003).
 */
export function lineCostDop(line: InvoiceLine, state: AppState): number | null {
  if (line.type === 'SERVICE' || line.type === 'DELIVERY') {
    return 0;
  }

  if (line.acquisitionCostDop != null) {
    return roundMoney(line.acquisitionCostDop * line.quantity);
  }

  if (line.itemId) {
    const item = state.items.find((entry) => entry.id === line.itemId);
    if (item?.acquisitionCostDop == null) {
      return null;
    }
    return roundMoney(item.acquisitionCostDop * line.quantity);
  }

  if (line.qtyProductId) {
    const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
    if (!product) {
      return null;
    }
    return roundMoney(product.unitCostDop * line.quantity);
  }

  return null;
}

/**
 * Gross profit in DOP for a completed DOP invoice.
 * Returns null if any line has unknown cost or the invoice is not a DOP completed sale.
 */
export function invoiceProfitDop(invoice: Invoice, state: AppState): number | null {
  if (
    (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') ||
    invoice.currency !== 'DOP'
  ) {
    return null;
  }

  let costTotal = 0;

  for (const line of invoice.lines) {
    const cost = lineCostDop(line, state);
    if (cost == null) {
      return null;
    }
    costTotal += cost;
  }

  return roundMoney(invoiceTotal(invoice) - costTotal);
}
