import type { SalesRepository } from '../../api/contracts/repositories';
import { toListPage } from '../../api/contracts/pagination';
import { businessDateFromTimestamp } from '../../api/client/profitability-series';
import type {
  AddDraftLineInput,
  AddPaymentInput,
  CancelInvoiceInput,
  ConfirmInvoicePayment,
  CorrectCurrencyInput,
  RemoveDraftLineInput,
  SalesListTab,
  SetDraftLinePriceInput,
  SetDraftLineQuantityInput,
  SetDraftMetaInput,
} from '../../api/contracts/sales';
import { err, ok } from '../../shared/auth/types';
import {
  addDraftLine,
  addPayment,
  cancelInvoice,
  confirmInvoice,
  convertQuote,
  correctCurrency,
  createDraft,
  createQuote,
  duplicateQuote,
  discardDraft,
  removeDraftLine,
  issueQuote,
  setDraftLinePrice,
  setDraftLineQuantity,
  setDraftMeta,
} from '../services/sales-commands';
import { buildInvoiceDetail, buildReceivables, buildSalesList } from '../services/sales-catalog';
import { buildPosDraftView } from '../services/sales-draft';
import { requireAdministrator, requirePermission } from '../services/require-permission';
import { cloneForRead, getMockState } from '../state';

export class MockSalesRepository implements SalesRepository {
  async listInvoices(
    tab: SalesListTab = 'ALL',
    page = 1,
    q = '',
    filters: Parameters<SalesRepository['listInvoices']>[3] = {},
  ) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const rows = buildSalesList(getMockState(), tab, q, permission.value).filter((row) => {
      const documentDate = row.confirmedAt ?? row.quoteIssuedAt ?? row.createdAt;
      const calendarDate = businessDateFromTimestamp(documentDate);
      return (
        (!filters.dateFrom || calendarDate >= filters.dateFrom) &&
        (!filters.dateTo || calendarDate <= filters.dateTo)
      );
    });
    return ok(toListPage(cloneForRead(rows), page));
  }

  async listReceivables(page = 1, filters?: Parameters<SalesRepository['listReceivables']>[1]) {
    const permission = requireAdministrator();
    if (!permission.ok) {
      return permission;
    }

    const snapshot = cloneForRead(buildReceivables(getMockState(), filters));
    const paged = toListPage(snapshot.invoices, page);
    return ok({
      invoices: paged.items,
      customers: snapshot.customers,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    });
  }

  async getInvoice(id: string) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const invoice = getMockState().invoices.find((entry) => entry.id === id);
    if (!invoice) {
      return err({ code: 'NOT_FOUND', message: 'Factura no encontrada' });
    }

    return ok(cloneForRead(buildInvoiceDetail(getMockState(), invoice, permission.value)));
  }

  async getInvoicePdf() {
    return err({
      code: 'INTERNAL',
      message: 'El prototipo mock usa la vista previa HTML, no bytes de PDF.',
    });
  }

  async regenerateInvoicePdf() {
    return err({
      code: 'INTERNAL',
      message: 'La regeneración de PDF no está disponible en el prototipo mock.',
    });
  }

  async addPayment(input: AddPaymentInput) {
    const permission = requireAdministrator();
    if (!permission.ok) {
      return permission;
    }

    const result = addPayment(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildInvoiceDetail(getMockState(), result.value, permission.value)));
  }

  async cancelInvoice(input: CancelInvoiceInput) {
    const permission = requirePermission('sales.cancel');
    if (!permission.ok) {
      return permission;
    }

    const result = cancelInvoice(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildInvoiceDetail(getMockState(), result.value, permission.value)));
  }

  async correctCurrency(input: CorrectCurrencyInput) {
    const permission = requirePermission('sales.correctCurrency');
    if (!permission.ok) {
      return permission;
    }

    const result = correctCurrency(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildInvoiceDetail(getMockState(), result.value, permission.value)));
  }

  async createDraft() {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = createDraft(getMockState(), permission.value);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(result.value));
  }

  async createQuote() {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) return permission;
    return createQuote(getMockState(), permission.value);
  }

  async getDraft(id: string) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const invoice = getMockState().invoices.find((entry) => entry.id === id);
    if (!invoice) {
      return err({ code: 'NOT_FOUND', message: 'Borrador no encontrado' });
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), invoice)));
  }

  async addLine(input: AddDraftLineInput) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = addDraftLine(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async removeLine(input: RemoveDraftLineInput) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = removeDraftLine(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async setLinePrice(input: SetDraftLinePriceInput) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = setDraftLinePrice(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async setLineQuantity(input: SetDraftLineQuantityInput) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = setDraftLineQuantity(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async setDraftMeta(input: SetDraftMetaInput) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = setDraftMeta(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async confirmInvoice(draftId: string, payment?: ConfirmInvoicePayment) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = confirmInvoice(getMockState(), permission.value, draftId, payment);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async issueQuote(draftId: string) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) return permission;
    const result = issueQuote(getMockState(), permission.value, draftId);
    if (!result.ok) return result;
    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async duplicateQuote(quoteId: string) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) return permission;
    return duplicateQuote(getMockState(), permission.value, quoteId);
  }

  async convertQuote(quoteId: string, payment?: ConfirmInvoicePayment) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) return permission;
    const result = convertQuote(getMockState(), permission.value, quoteId, payment);
    if (!result.ok) return result;
    return ok(cloneForRead(buildPosDraftView(getMockState(), result.value)));
  }

  async discardDraft(draftId: string) {
    const permission = requirePermission('sales.manage');
    if (!permission.ok) {
      return permission;
    }

    return discardDraft(getMockState(), permission.value, draftId);
  }
}

export const mockSalesRepository = new MockSalesRepository();
