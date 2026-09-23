import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  AddPaymentInput,
  CancelInvoiceInput,
  ConvertConduceToInvoiceInput,
  CorrectCurrencyInput,
  ConducePdfDownload,
  InvoiceDetailView,
  InvoicePdfDownload,
} from '../../api/contracts/sales';
import type { AppError, Result } from '../../shared/auth/types';
import { salesRepository } from '../../api/repositories';

type DetailQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; detail: InvoiceDetailView };

export function useInvoiceDetail(id: string | undefined) {
  const navigate = useNavigate();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<DetailQuery>({ status: 'loading' });
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!id) {
      setResult({ status: 'error', error: { code: 'VALIDATION', message: 'Falta el identificador' } });
      return;
    }

    let cancelled = false;
    setResult({ status: 'loading' });

    salesRepository.getInvoice(id).then((response) => {
      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }

      if (response.value.status === 'DRAFT') {
        navigate(`/sales/draft/${response.value.id}`, { replace: true });
        return;
      }
      if (response.value.status === 'QUOTE_DRAFT' || response.value.status === 'QUOTE_ISSUED') {
        navigate(`/sales/quote/${response.value.id}`, { replace: true });
        return;
      }

      setResult({ status: 'ready', detail: response.value });
    });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken, navigate]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const addPayment = useCallback(async (input: AddPaymentInput): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await salesRepository.addPayment(input);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    reload();
    return { ok: true, value: undefined };
  }, [reload]);

  const cancelInvoice = useCallback(async (input: CancelInvoiceInput): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await salesRepository.cancelInvoice(input);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    reload();
    return { ok: true, value: undefined };
  }, [reload]);

  const correctCurrency = useCallback(async (input: CorrectCurrencyInput): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await salesRepository.correctCurrency(input);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    reload();
    return { ok: true, value: undefined };
  }, [reload]);

  const convertConduceToInvoice = useCallback(
    async (invoiceId: string, input: ConvertConduceToInvoiceInput): Promise<Result<void>> => {
      setIsMutating(true);
      const response = await salesRepository.convertConduceToInvoice(invoiceId, input);
      setIsMutating(false);
      if (!response.ok) {
        return response;
      }
      reload();
      return { ok: true, value: undefined };
    },
    [reload],
  );

  const getInvoicePdf = useCallback(async (invoiceId: string): Promise<Result<InvoicePdfDownload>> => {
    return salesRepository.getInvoicePdf(invoiceId);
  }, []);

  const getConducePdf = useCallback(async (invoiceId: string): Promise<Result<ConducePdfDownload>> => {
    return salesRepository.getConducePdf(invoiceId);
  }, []);

  const regenerateInvoicePdf = useCallback(async (invoiceId: string): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await salesRepository.regenerateInvoicePdf(invoiceId);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    reload();
    return { ok: true, value: undefined };
  }, [reload]);

  return {
    result,
    isMutating,
    addPayment,
    cancelInvoice,
    correctCurrency,
    convertConduceToInvoice,
    getInvoicePdf,
    getConducePdf,
    regenerateInvoicePdf,
  };
}
