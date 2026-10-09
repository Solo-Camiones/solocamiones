// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PosDraftView, PosLineView } from '../../../../src/api/contracts/sales';
import {
  restoreDiscardedDraft,
  snapshotPosDraft,
  snapshotPosLine,
  toPosAddLineInput,
  usePos,
} from '../../../../src/features/sales/usePos';
import { err, ok } from '../../../../src/shared/auth/types';

const repository = vi.hoisted(() => ({
  createDraft: vi.fn(),
  createQuote: vi.fn(),
  getDraft: vi.fn(),
  addLine: vi.fn(),
  removeLine: vi.fn(),
  setLinePrice: vi.fn(),
  setLineQuantity: vi.fn(),
  setDraftMeta: vi.fn(),
  confirmInvoice: vi.fn(),
  issueConduce: vi.fn(),
  issueQuote: vi.fn(),
  duplicateQuote: vi.fn(),
  convertQuote: vi.fn(),
  convertQuoteToConduce: vi.fn(),
  getQuotePdf: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock('../../../../src/api/repositories', () => ({ salesRepository: repository }));

const line = {
  id: 'line-1',
  type: 'ITEM',
  itemId: 'item-1',
  qtyProductId: null,
  serviceId: null,
  description: 'Filtro',
  notes: null,
  quantity: 2,
  unitPrice: 100,
  pricePending: false,
} as unknown as PosLineView;

const draft = {
  draftId: 'draft-1',
  customerId: 'customer-1',
  currency: 'DOP',
  fiscal: false,
  applyItbis: true,
  discountPercent: 0,
  lines: [line],
} as unknown as PosDraftView;

function wrapper({ children }: PropsWithChildren) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('usePos helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates stable snapshots and restores a discarded draft, including its item price', async () => {
    const pendingDraft = {
      ...draft,
      lines: [{ ...line, id: 'restored-line', pricePending: true }],
    };
    repository.createDraft.mockResolvedValue(ok(draft));
    repository.setDraftMeta.mockResolvedValue(ok(draft));
    repository.addLine.mockResolvedValue(ok(pendingDraft));
    repository.setLinePrice.mockResolvedValue(ok(draft));

    const lineSnapshot = snapshotPosLine(line);
    const draftSnapshot = snapshotPosDraft(draft);

    expect(toPosAddLineInput(lineSnapshot)).not.toHaveProperty('pricePending');
    await expect(restoreDiscardedDraft(draftSnapshot)).resolves.toEqual(ok('draft-1'));
    expect(repository.setLinePrice).toHaveBeenCalledWith({
      draftId: 'draft-1',
      lineId: 'restored-line',
      unitPrice: 100,
    });
  });

  it.each(['createDraft', 'setDraftMeta', 'addLine'] as const)(
    'returns the first %s failure while restoring a draft',
    async (operation) => {
      const failure = err({ code: 'CONFLICT', message: 'No se pudo restaurar' });
      repository.createDraft.mockResolvedValue(operation === 'createDraft' ? failure : ok(draft));
      repository.setDraftMeta.mockResolvedValue(operation === 'setDraftMeta' ? failure : ok(draft));
      repository.addLine.mockResolvedValue(operation === 'addLine' ? failure : ok(draft));

      await expect(restoreDiscardedDraft(snapshotPosDraft(draft))).resolves.toEqual(failure);
    },
  );
});

describe('usePos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getDraft.mockResolvedValue(ok(draft));
  });

  it('loads a draft and applies all successful draft mutations', async () => {
    for (const method of [
      'addLine',
      'removeLine',
      'setLinePrice',
      'setLineQuantity',
      'setDraftMeta',
      'issueQuote',
    ] as const) {
      repository[method].mockResolvedValue(ok(draft));
    }
    repository.confirmInvoice.mockResolvedValue(ok(draft));
    repository.issueConduce.mockResolvedValue(ok(draft));
    repository.duplicateQuote.mockResolvedValue(ok(draft));
    repository.convertQuote.mockResolvedValue(ok(draft));
    repository.convertQuoteToConduce.mockResolvedValue(ok(draft));
    repository.getQuotePdf.mockResolvedValue(ok({ blob: new Blob(), filename: 'quote.pdf' }));
    repository.discardDraft.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => usePos('draft-1'), { wrapper });

    await waitFor(() => expect(result.current.result.status).toBe('ready'));

    await act(async () => {
      await expect(
        result.current.addLine(toPosAddLineInput(snapshotPosLine(line))),
      ).resolves.toEqual(ok(undefined));
      await expect(result.current.removeLine('line-1')).resolves.toEqual(ok(undefined));
      await expect(result.current.setLinePrice('line-1', 120)).resolves.toEqual(ok(undefined));
      await expect(result.current.setLineQuantity('line-1', 3)).resolves.toEqual(ok(undefined));
      await expect(
        result.current.updateLine('line-1', { unitPrice: 130, quantity: 4 }),
      ).resolves.toEqual(ok(undefined));
      await expect(result.current.setMeta({ currency: 'USD' })).resolves.toEqual(ok(undefined));
      await expect(result.current.confirm()).resolves.toEqual(ok(undefined));
      await expect(result.current.issueConduce()).resolves.toEqual(ok(undefined));
      await expect(result.current.issueQuote()).resolves.toEqual(ok(undefined));
      await expect(result.current.duplicateQuote()).resolves.toEqual(ok(undefined));
      await expect(result.current.convertQuote()).resolves.toEqual(ok(undefined));
      await expect(result.current.convertQuoteToConduce()).resolves.toEqual(ok(undefined));
      await expect(result.current.getQuotePdf()).resolves.toEqual(
        ok({ blob: expect.any(Blob), filename: 'quote.pdf' }),
      );
      await expect(result.current.discard()).resolves.toEqual(ok(undefined));
      await expect(result.current.restoreRemovedLine(snapshotPosLine(line))).resolves.toEqual(
        ok(undefined),
      );
    });

    expect(result.current.isMutating).toBe(false);
  });

  it('reports load and mutation failures and rejects commands while the draft is not ready', async () => {
    const appError = { code: 'NOT_FOUND' as const, message: 'Borrador no encontrado' };
    const failure = err(appError);
    repository.getDraft.mockResolvedValue(failure);
    repository.addLine.mockResolvedValue(failure);
    const { result, rerender } = renderHook(({ id }) => usePos(id), {
      initialProps: { id: 'missing' as string | undefined },
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.result).toEqual({ status: 'error', error: appError }),
    );
    await act(async () => {
      await expect(
        result.current.addLine(toPosAddLineInput(snapshotPosLine(line))),
      ).resolves.toEqual(failure);
    });

    rerender({ id: undefined });
    await waitFor(() => expect(result.current.result.status).toBe('error'));
    await expect(result.current.removeLine('line-1')).resolves.toMatchObject({ ok: false });
    await expect(result.current.issueQuote()).resolves.toMatchObject({ ok: false });
    await expect(result.current.getQuotePdf()).resolves.toMatchObject({ ok: false });
  });

  it('creates sale and quote drafts and ignores a late load after unmount', async () => {
    repository.createDraft.mockResolvedValue(ok(draft));
    repository.createQuote.mockResolvedValue(ok(draft));
    const sale = renderHook(() => usePos('new'), { wrapper });
    const quote = renderHook(() => usePos('new', 'quote'), { wrapper });

    await waitFor(() => expect(repository.createDraft).toHaveBeenCalledOnce());
    await waitFor(() => expect(repository.createQuote).toHaveBeenCalledOnce());
    sale.unmount();
    quote.unmount();

    let resolveDraft!: (value: ReturnType<typeof ok<PosDraftView>>) => void;
    repository.getDraft.mockReturnValue(
      new Promise((resolve) => {
        resolveDraft = resolve;
      }),
    );
    const pending = renderHook(() => usePos('draft-1'), { wrapper });
    pending.unmount();
    await act(async () => resolveDraft(ok(draft)));
  });
});
