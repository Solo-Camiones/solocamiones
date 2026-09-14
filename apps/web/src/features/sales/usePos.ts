import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Currency } from '../../api/contracts/entities';
import type {
  AddDraftLineInput,
  ConfirmInvoicePayment,
  PosDraftView,
  PosLineView,
  SetDraftMetaInput,
} from '../../api/contracts/sales';
import type { AppError, Result } from '../../shared/auth/types';
import { salesRepository } from '../../api/repositories';

/** Fields needed to re-add a line after Quitar or Descartar. */
export type PosLineSnapshot = Pick<
  PosLineView,
  | 'type'
  | 'itemId'
  | 'qtyProductId'
  | 'serviceId'
  | 'description'
  | 'notes'
  | 'quantity'
  | 'unitPrice'
  | 'acquisitionCostDop'
  | 'costProvenance'
  | 'pricePending'
>;

export type PosDraftSnapshot = {
  customerId: string;
  currency: Currency;
  fiscal: boolean;
  lines: PosLineSnapshot[];
};

export function snapshotPosLine(line: PosLineView): PosLineSnapshot {
  return {
    type: line.type,
    itemId: line.itemId,
    qtyProductId: line.qtyProductId,
    serviceId: line.serviceId,
    description: line.description,
    notes: line.notes,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    acquisitionCostDop: line.acquisitionCostDop,
    costProvenance: line.costProvenance,
    pricePending: line.pricePending,
  };
}

export function snapshotPosDraft(draft: PosDraftView): PosDraftSnapshot {
  return {
    customerId: draft.customerId,
    currency: draft.currency,
    fiscal: draft.fiscal,
    lines: draft.lines.map(snapshotPosLine),
  };
}

export function toPosAddLineInput(line: PosLineSnapshot): Omit<AddDraftLineInput, 'draftId'> {
  return {
    type: line.type,
    itemId: line.itemId,
    qtyProductId: line.qtyProductId,
    serviceId: line.serviceId,
    description: line.description,
    notes: line.notes,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    acquisitionCostDop: line.acquisitionCostDop,
    costProvenance: line.costProvenance,
  };
}

/**
 * ITEM addLine always leaves pricePending; restore the committed price so undo
 * matches the line the seller removed. Other types already accept unitPrice.
 */
async function restoreLinePriceIfNeeded(
  draftId: string,
  draft: PosDraftView,
  line: PosLineSnapshot,
): Promise<Result<PosDraftView>> {
  if (line.type !== 'ITEM' || line.pricePending) {
    return { ok: true, value: draft };
  }

  const restored = draft.lines.find((entry) => entry.itemId === line.itemId);
  if (!restored || !restored.pricePending) {
    return { ok: true, value: draft };
  }

  return salesRepository.setLinePrice({
    draftId,
    lineId: restored.id,
    unitPrice: line.unitPrice,
  });
}

async function addLineFromSnapshot(
  draftId: string,
  line: PosLineSnapshot,
): Promise<Result<PosDraftView>> {
  const added = await salesRepository.addLine({
    draftId,
    ...toPosAddLineInput(line),
  });
  if (!added.ok) {
    return added;
  }
  return restoreLinePriceIfNeeded(draftId, added.value, line);
}

/**
 * Recreates a discarded draft on a new id (discard cannot be reversed in place).
 * Used from the undo toast after PosPage has already navigated away.
 */
export async function restoreDiscardedDraft(snapshot: PosDraftSnapshot): Promise<Result<string>> {
  const created = await salesRepository.createDraft();
  if (!created.ok) {
    return created;
  }

  const draftId = created.value.draftId;
  const meta = await salesRepository.setDraftMeta({
    draftId,
    customerId: snapshot.customerId,
    currency: snapshot.currency,
    fiscal: snapshot.fiscal,
  });
  if (!meta.ok) {
    return meta;
  }

  for (const line of snapshot.lines) {
    const restored = await addLineFromSnapshot(draftId, line);
    if (!restored.ok) {
      return restored;
    }
  }

  return { ok: true, value: draftId };
}

type PosQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; draft: PosDraftView };

export function usePos(draftId: string | undefined) {
  const navigate = useNavigate();
  const draftCreationRef = useRef<ReturnType<typeof salesRepository.createDraft> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<PosQuery>({ status: 'loading' });
  const [isMutating, setIsMutating] = useState(false);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!draftId) {
      setResult({
        status: 'error',
        error: { code: 'VALIDATION', message: 'Falta el identificador del borrador' },
      });
      return;
    }

    if (draftId === 'new') {
      let cancelled = false;
      setResult({ status: 'loading' });
      draftCreationRef.current ??= salesRepository.createDraft();
      draftCreationRef.current.then((response) => {
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setResult({ status: 'error', error: response.error });
          return;
        }
        navigate(`/sales/draft/${response.value.draftId}`, { replace: true });
      });
      return () => {
        cancelled = true;
      };
    }

    draftCreationRef.current = null;

    let cancelled = false;
    setResult({ status: 'loading' });
    salesRepository.getDraft(draftId).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }
      setResult({ status: 'ready', draft: response.value });
    });

    return () => {
      cancelled = true;
    };
  }, [draftId, navigate, reloadToken]);

  const applyDraftResult = useCallback((response: Result<PosDraftView>): Result<void> => {
    if (!response.ok) {
      return response;
    }
    setResult({ status: 'ready', draft: response.value });
    return { ok: true, value: undefined };
  }, []);

  const mutationLock = useRef(false);

  const runExclusive = useCallback(
    async (work: () => Promise<Result<void>>): Promise<Result<void>> => {
      if (mutationLock.current) {
        return {
          ok: false,
          error: { code: 'VALIDATION', message: 'Hay otra operación en curso. Espere un momento.' },
        };
      }

      mutationLock.current = true;
      setIsMutating(true);
      try {
        return await work();
      } finally {
        mutationLock.current = false;
        setIsMutating(false);
      }
    },
    [],
  );

  const addLine = useCallback(
    async (input: Omit<AddDraftLineInput, 'draftId'>): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(await salesRepository.addLine({ ...input, draftId })),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const removeLine = useCallback(
    async (lineId: string): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(await salesRepository.removeLine({ draftId, lineId })),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const setLinePrice = useCallback(
    async (lineId: string, unitPrice: number): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(await salesRepository.setLinePrice({ draftId, lineId, unitPrice })),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const setLineQuantity = useCallback(
    async (lineId: string, quantity: number): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(await salesRepository.setLineQuantity({ draftId, lineId, quantity })),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const updateLine = useCallback(
    async (
      lineId: string,
      patch: {
        unitPrice: number;
        quantity?: number;
        description?: string;
        notes?: string | null;
        acquisitionCostDop?: number | null;
        costProvenance?: PosLineView['costProvenance'];
      },
    ): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(
          await salesRepository.setLinePrice({
            draftId,
            lineId,
            unitPrice: patch.unitPrice,
            quantity: patch.quantity,
            description: patch.description,
            notes: patch.notes,
            acquisitionCostDop: patch.acquisitionCostDop,
            costProvenance: patch.costProvenance,
          }),
        ),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const setMeta = useCallback(
    async (input: Omit<SetDraftMetaInput, 'draftId'>): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () =>
        applyDraftResult(await salesRepository.setDraftMeta({ ...input, draftId })),
      );
    },
    [applyDraftResult, draftId, runExclusive],
  );

  const confirm = useCallback(
    async (payment?: ConfirmInvoicePayment): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () => {
        const response = await salesRepository.confirmInvoice(draftId, payment);
        if (!response.ok) {
          return response;
        }
        reload();
        return { ok: true, value: undefined };
      });
    },
    [draftId, reload, runExclusive],
  );

  const discard = useCallback(async (): Promise<Result<void>> => {
    if (!draftId || draftId === 'new') {
      return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
    }
    return runExclusive(async () => {
      const response = await salesRepository.discardDraft(draftId);
      if (!response.ok) {
        return response;
      }
      navigate('/sales');
      return { ok: true, value: undefined };
    });
  }, [draftId, navigate, runExclusive]);

  const restoreRemovedLine = useCallback(
    async (line: PosLineSnapshot): Promise<Result<void>> => {
      if (!draftId || draftId === 'new') {
        return { ok: false, error: { code: 'VALIDATION', message: 'Borrador no listo' } };
      }
      return runExclusive(async () => applyDraftResult(await addLineFromSnapshot(draftId, line)));
    },
    [applyDraftResult, draftId, runExclusive],
  );

  return {
    result,
    isMutating,
    addLine,
    removeLine,
    setLinePrice,
    setLineQuantity,
    updateLine,
    setMeta,
    confirm,
    discard,
    restoreRemovedLine,
  };
}
