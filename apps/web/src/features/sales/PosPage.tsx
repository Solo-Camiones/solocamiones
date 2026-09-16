import { Fragment, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import type { PosDraftView, PosLineView } from '../../api/contracts/sales';
import { PageHeader } from '../../shared/layout/PageHeader';
import { BackToSalesLink } from './BackToSalesLink';
import { useMediaQuery } from '../../shared/layout/useMediaQuery';
import { AssemblyKindChip, RelationChip } from '../../shared/domain';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UNDO_TOAST_DURATION_MS, UX_TERMS } from '../../shared/copy/glossary';
import { Button, Card, Chip, ConfirmActionModal, Info, money, useToast } from '../../shared/ui';
import { AddLineModal } from './AddLineModal';
import { AssemblyTree } from './AssemblyTree';
import { ConfirmSaleModal } from './ConfirmSaleModal';
import { DocumentPanel } from './DocumentPanel';
import { EditLineModal, type PosLineManualPatch } from './EditLineModal';
import { LINE_TYPE_LABELS } from './labels';
import { InvoiceLineNoteText } from './InvoiceLineNoteText';
import {
  firstPosProblemElementId,
  focusPosElement,
  POS_DISCARD_DRAFT_CANCEL,
  POS_DISCARD_DRAFT_CONFIRM,
  POS_DISCARD_DRAFT_TITLE,
  POS_DRAFT_DISCARDED_TOAST,
  POS_FIELD_IDS,
  POS_LINE_REMOVED_TOAST,
  POS_REMOVE_LINE_CONFIRM,
  POS_REMOVE_LINE_TITLE,
  POS_UNDO_LABEL,
  POS_VIEW_REQUIREMENTS_LABEL,
  posBlockedConfirmSummary,
  posDraftDescription,
  posEmptyLinesMessage,
  posLinePriceFieldId,
  posLineSku,
  toPosUserMessage,
} from './pos-copy';
import { TotalsPanel } from './TotalsPanel';
import { restoreDiscardedDraft, snapshotPosDraft, snapshotPosLine, usePos } from './usePos';

/** Tailwind `lg` — table on desktop, cards on tablet/mobile. */
const POS_LINES_TABLE_MIN_WIDTH_PX = 1024;
const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';

export function PosPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const creationKind = location.pathname.includes('/sales/quote/') ? 'quote' : 'sale';
  const pos = usePos(id, creationKind);
  const capabilities = useAppCapabilities();
  const { pushToast } = useToast();
  const isDesktopLines = useMediaQuery(`(min-width: ${POS_LINES_TABLE_MIN_WIDTH_PX}px)`, true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<PosLineView | null>(null);
  const [linePendingRemoval, setLinePendingRemoval] = useState<PosLineView | null>(null);
  const [discardPending, setDiscardPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  if (pos.result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar el punto de venta">
        {pos.result.error.message}
      </Info>
    );
  }

  if (pos.result.status === 'loading') {
    return (
      <p className="text-sm text-navy-400" aria-live="polite">
        Cargando borrador…
      </p>
    );
  }

  const draft = pos.result.draft;
  const isQuoteDraft = draft.status === 'QUOTE_DRAFT';
  const isIssuedQuote = draft.status === 'QUOTE_ISSUED';
  const readOnly = draft.status !== 'DRAFT' && !isQuoteDraft;
  const confirmBlocked = draft.blockers.length > 0;
  const blockedSummary = posBlockedConfirmSummary(draft.blockers);

  async function handleAddLine(input: Parameters<typeof pos.addLine>[0]) {
    setAddError(null);
    const response = await pos.addLine(input);
    if (!response.ok) {
      setAddError(toPosUserMessage(response.error));
      return;
    }
    setAddOpen(false);
    pushToast('Línea agregada', 'success');
  }

  async function handleRemoveLine(line: PosLineView) {
    const snapshot = snapshotPosLine(line);
    const response = await pos.removeLine(line.id);
    if (!response.ok) {
      pushToast(toPosUserMessage(response.error), 'error');
      return;
    }
    setLinePendingRemoval(null);
    pushToast(POS_LINE_REMOVED_TOAST, 'success', {
      durationMs: UNDO_TOAST_DURATION_MS,
      action: {
        label: POS_UNDO_LABEL,
        onClick: () => {
          void pos.restoreRemovedLine(snapshot).then((restored) => {
            if (!restored.ok) {
              pushToast(toPosUserMessage(restored.error), 'error');
            }
          });
        },
      },
    });
  }

  async function handleDiscardDraft() {
    setDiscardError(null);
    if (draft.lines.length === 0) {
      const response = await pos.discard();
      if (!response.ok) {
        setDiscardError(toPosUserMessage(response.error));
        return;
      }
      setDiscardPending(false);
      return;
    }

    const snapshot = snapshotPosDraft(draft);
    const response = await pos.discard();
    if (!response.ok) {
      setDiscardError(toPosUserMessage(response.error));
      return;
    }
    setDiscardPending(false);

    pushToast(POS_DRAFT_DISCARDED_TOAST, 'success', {
      durationMs: UNDO_TOAST_DURATION_MS,
      action: {
        label: POS_UNDO_LABEL,
        onClick: () => {
          void restoreDiscardedDraft(snapshot).then((restored) => {
            if (!restored.ok) {
              pushToast(toPosUserMessage(restored.error), 'error');
              return;
            }
            navigate(`/sales/draft/${restored.value}`);
          });
        },
      },
    });
  }

  async function handleUpdateLine(line: PosLineView, patch: PosLineManualPatch) {
    setEditError(null);
    const response = await pos.updateLine(line.id, patch);
    if (!response.ok) {
      setEditError(toPosUserMessage(response.error));
      return;
    }
    setEditingLine(null);
    pushToast('Línea actualizada', 'success');
  }

  function handleViewRequirements() {
    const elementId = firstPosProblemElementId(draft);
    const pendingPriceLine = draft.lines.find((line) => line.pricePending);
    if (pendingPriceLine && elementId === posLinePriceFieldId(pendingPriceLine.id)) {
      setEditError(null);
      setEditingLine(pendingPriceLine);
      return;
    }
    if (elementId) {
      focusPosElement(elementId);
    }
  }

  return (
    <>
      <PageHeader
        leading={<BackToSalesLink />}
        title={isIssuedQuote || isQuoteDraft ? 'Cotización' : 'Punto de venta'}
        description={
          isIssuedQuote
            ? `${draft.quoteNumber ?? 'Cotización emitida'} · ${draft.quoteExpired ? 'Vencida' : 'Vigente'}`
            : readOnly
              ? `${draft.number ? `Factura ${draft.number} confirmada` : 'Factura confirmada'}. ${
                  capabilities.payments
                    ? 'Pagos y vista previa del documento están en el detalle.'
                    : 'La vista previa del documento está en el detalle.'
                }`
              : posDraftDescription(capabilities)
        }
      />

      {discardError && (
        <div className="mb-4">
          <Info tone="error" title="No se pudo descartar">
            {discardError}
          </Info>
        </div>
      )}

      {operationError && (
        <div className="mb-4">
          <Info tone="error" title="No se pudo completar la operación">
            {operationError}
          </Info>
        </div>
      )}

      {isIssuedQuote && (
        <div className="mb-6">
          <Info
            tone={draft.quoteExpired ? 'warning' : 'success'}
            title={`${draft.quoteNumber ?? 'Cotización emitida'} ${draft.quoteExpired ? 'vencida' : 'vigente'}`}
          >
            Cliente {draft.customerName}. Total {money(draft.totals.gross, draft.currency)}.
            {draft.quoteExpiresAt
              ? ` Vence el ${new Date(draft.quoteExpiresAt).toLocaleDateString('es-DO', {
                  timeZone: BUSINESS_TIME_ZONE,
                })}.`
              : ''}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pos.isMutating || draft.quoteExpired}
                onClick={() => {
                  setOperationError(null);
                  setConfirmOpen(true);
                }}
              >
                Convertir a factura
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pos.isMutating}
                onClick={() => {
                  setOperationError(null);
                  void pos.duplicateQuote().then((response) => {
                    if (!response.ok) setOperationError(toPosUserMessage(response.error));
                  });
                }}
              >
                Duplicar cotización
              </Button>
            </div>
          </Info>
        </div>
      )}

      {readOnly && !isIssuedQuote && (
        <div className="mb-6">
          <Info tone="success" title={`Factura ${draft.number} confirmada`}>
            Cliente {draft.customerName}. Total {money(draft.totals.gross, draft.currency)}.
            {draft.createdWorkOrderIds.length > 0 && capabilities.workOrders
              ? ` Orden de ${UX_TERMS.dismantling.toLowerCase()}: ${draft.createdWorkOrderIds.join(', ')}.`
              : ''}{' '}
            <Link to={`/sales/${draft.id}`} className="font-medium text-brand hover:underline">
              Ver detalle
            </Link>
          </Info>
        </div>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {!readOnly && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={pos.isMutating}
                onClick={() => setAddOpen(true)}
              >
                Agregar línea
              </Button>
            </div>
          )}
          <Card id={POS_FIELD_IDS.lines} tabIndex={-1} className="outline-none">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-navy">Líneas</h2>
              <Chip>
                {draft.number ??
                  draft.quoteNumber ??
                  (isQuoteDraft ? 'Cotización borrador' : readOnly ? 'Factura' : 'Borrador')}
              </Chip>
              {draft.fiscal ? (
                <Chip tone="brand">Fiscal</Chip>
              ) : (
                <Chip>Sin comprobante fiscal</Chip>
              )}
            </div>
            {draft.lines.length === 0 ? (
              <p className="text-sm text-navy-400">{posEmptyLinesMessage(capabilities)}</p>
            ) : isDesktopLines ? (
              <DraftLinesTable
                draft={draft}
                readOnly={readOnly}
                isMutating={pos.isMutating}
                onEdit={(line) => {
                  setEditError(null);
                  setEditingLine(line);
                }}
                onRemove={setLinePendingRemoval}
              />
            ) : (
              <DraftLineCards
                draft={draft}
                readOnly={readOnly}
                isMutating={pos.isMutating}
                onEdit={(line) => {
                  setEditError(null);
                  setEditingLine(line);
                }}
                onRemove={setLinePendingRemoval}
              />
            )}
          </Card>

          {draft.lines
            .filter((line) => line.isAssembly && line.tree && line.itemId)
            .map((line) => (
              <AssemblyTree key={line.id} tree={line.tree!} currentId={line.itemId!} />
            ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!readOnly && <div className="hidden min-h-11 xl:block" aria-hidden />}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-navy">Documento</h2>
            <DocumentPanel
              draft={draft}
              readOnly={readOnly}
              isMutating={pos.isMutating}
              error={metaError}
              onCustomerChange={(customerId) => {
                setMetaError(null);
                void pos.setMeta({ customerId }).then((response) => {
                  if (!response.ok) {
                    setMetaError(toPosUserMessage(response.error));
                  }
                });
              }}
              onCurrencyChange={(currency) => {
                setMetaError(null);
                void pos.setMeta({ currency }).then((response) => {
                  if (!response.ok) {
                    setMetaError(toPosUserMessage(response.error));
                  }
                });
              }}
              onFiscalChange={(fiscal) => {
                setMetaError(null);
                void pos.setMeta({ fiscal }).then((response) => {
                  if (!response.ok) {
                    setMetaError(toPosUserMessage(response.error));
                  }
                });
              }}
              onApplyItbisChange={(applyItbis) => {
                setMetaError(null);
                void pos.setMeta({ applyItbis }).then((response) => {
                  if (!response.ok) {
                    setMetaError(toPosUserMessage(response.error));
                  }
                });
              }}
            />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-navy">Totales</h2>
            {draft.blockers.length > 0 && !readOnly && (
              <div id={POS_FIELD_IDS.blockers} tabIndex={-1} className="mb-4 outline-none">
                <Info tone="warning" title="No se puede confirmar todavía">
                  <ul className="list-disc space-y-1 pl-5">
                    {draft.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Info>
              </div>
            )}
            <TotalsPanel totals={draft.totals} currency={draft.currency} />
          </Card>
          {!readOnly && (
            <PosCheckoutActions
              isMutating={pos.isMutating}
              confirmBlocked={confirmBlocked}
              blockedSummary={blockedSummary}
              onDiscard={() => {
                setDiscardError(null);
                setDiscardPending(true);
              }}
              onConfirm={() => {
                if (isQuoteDraft) {
                  setOperationError(null);
                  void pos.issueQuote().then((response) => {
                    if (!response.ok) {
                      setOperationError(toPosUserMessage(response.error));
                      return;
                    }
                    pushToast('Cotización emitida', 'success');
                  });
                  return;
                }
                setConfirmError(null);
                setConfirmOpen(true);
              }}
              onViewRequirements={handleViewRequirements}
              confirmLabel={isQuoteDraft ? 'Emitir cotización' : 'Confirmar venta'}
              discardLabel={isQuoteDraft ? 'Descartar cotización' : 'Descartar borrador'}
            />
          )}
        </div>
      </div>

      <AddLineModal
        open={addOpen}
        draft={draft}
        isSaving={pos.isMutating}
        error={addError}
        onClose={() => {
          if (!pos.isMutating) {
            setAddOpen(false);
            setAddError(null);
          }
        }}
        onSubmit={handleAddLine}
      />

      <EditLineModal
        open={editingLine != null}
        draft={draft}
        line={editingLine}
        isSaving={pos.isMutating}
        error={editError}
        onClose={() => {
          if (!pos.isMutating) {
            setEditingLine(null);
            setEditError(null);
          }
        }}
        onSubmit={handleUpdateLine}
      />

      <ConfirmActionModal
        open={linePendingRemoval != null}
        title={POS_REMOVE_LINE_TITLE}
        confirmLabel={POS_REMOVE_LINE_CONFIRM}
        confirmVariant="danger"
        busy={pos.isMutating}
        onCancel={() => {
          if (!pos.isMutating) {
            setLinePendingRemoval(null);
          }
        }}
        onConfirm={() => {
          if (linePendingRemoval) {
            void handleRemoveLine(linePendingRemoval);
          }
        }}
      >
        <p className="text-sm text-navy-700">
          Se quitará <strong>{linePendingRemoval?.description}</strong> de este borrador. Después
          podrá deshacerlo desde el aviso.
        </p>
      </ConfirmActionModal>

      <ConfirmActionModal
        open={discardPending}
        title={POS_DISCARD_DRAFT_TITLE}
        confirmLabel={POS_DISCARD_DRAFT_CONFIRM}
        cancelLabel={POS_DISCARD_DRAFT_CANCEL}
        confirmVariant="danger"
        busy={pos.isMutating}
        onCancel={() => {
          if (!pos.isMutating) {
            setDiscardPending(false);
          }
        }}
        onConfirm={() => {
          void handleDiscardDraft();
        }}
      >
        <p className="text-sm text-navy-700">
          {draft.lines.length === 0
            ? 'Se eliminará este borrador vacío y volverá al listado de ventas.'
            : 'Se eliminará este borrador y todas sus líneas. Después podrá deshacerlo desde el aviso.'}
        </p>
      </ConfirmActionModal>

      <ConfirmSaleModal
        open={confirmOpen}
        draft={draft}
        isConfirming={pos.isMutating}
        error={confirmError}
        onClose={() => {
          if (!pos.isMutating) {
            setConfirmOpen(false);
            setConfirmError(null);
          }
        }}
        onConfirm={(payment) => {
          const operation = isIssuedQuote ? pos.convertQuote(payment) : pos.confirm(payment);
          void operation.then((response) => {
            if (!response.ok) {
              setConfirmError(toPosUserMessage(response.error));
              return;
            }
            setConfirmOpen(false);
            pushToast(isIssuedQuote ? 'Cotización convertida' : 'Venta confirmada', 'success');
          });
        }}
      />
    </>
  );
}

type PosCheckoutActionsProps = {
  isMutating: boolean;
  confirmBlocked: boolean;
  blockedSummary: string | null;
  onDiscard: () => void;
  onConfirm: () => void;
  onViewRequirements: () => void;
  confirmLabel: string;
  discardLabel: string;
};

/**
 * Checkout sits under Totals. The container query stacks the pair when the
 * totals column is too narrow — confirm stays last, at its natural width.
 */
function PosCheckoutActions({
  isMutating,
  confirmBlocked,
  blockedSummary,
  onDiscard,
  onConfirm,
  onViewRequirements,
  confirmLabel,
  discardLabel,
}: PosCheckoutActionsProps) {
  return (
    <div className="@container">
      <div className="flex flex-col items-end gap-2 @min-[22rem]:flex-row @min-[22rem]:items-start @min-[22rem]:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-red-700 hover:bg-red-50"
          disabled={isMutating}
          onClick={onDiscard}
        >
          {discardLabel}
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="lg"
            disabled={isMutating || confirmBlocked}
            busy={isMutating}
            aria-describedby={confirmBlocked ? 'pos-confirm-block-reason' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          {confirmBlocked && blockedSummary && (
            <div className="flex max-w-xs flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-amber-800">
              <span id="pos-confirm-block-reason">{blockedSummary}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-0 px-0 py-0 text-sm font-semibold text-brand hover:bg-transparent"
                onClick={onViewRequirements}
              >
                {POS_VIEW_REQUIREMENTS_LABEL}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type DraftLinesProps = {
  draft: PosDraftView;
  readOnly: boolean;
  isMutating: boolean;
  onEdit: (line: PosLineView) => void;
  onRemove: (line: PosLineView) => void;
};

const DRAFT_LINE_DATA_COLUMN_COUNT = 6;

function DraftLinesTable({ draft, readOnly, isMutating, onEdit, onRemove }: DraftLinesProps) {
  const columnCount = readOnly ? DRAFT_LINE_DATA_COLUMN_COUNT : DRAFT_LINE_DATA_COLUMN_COUNT + 1;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-navy-400">
            <th className="py-2 pr-3 font-medium">Descripción</th>
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 font-medium">Cantidad</th>
            <th className="py-2 pr-3 font-medium">Precio</th>
            <th className="py-2 pr-3 font-medium">ITBIS</th>
            <th className="py-2 pr-3 font-medium">Total</th>
            {!readOnly && <th className="py-2 font-medium"> </th>}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line) => (
            <Fragment key={line.id}>
              <tr className={line.notes ? 'align-top' : 'border-b border-navy-50 align-top'}>
                <td className="py-3 pr-3">
                  <LineDescription line={line} />
                </td>
                <td className="py-3 pr-3">
                  <Chip>{LINE_TYPE_LABELS[line.type]}</Chip>
                </td>
                <td className="py-3 pr-3 text-navy">{line.quantity}</td>
                <td className="py-3 pr-3">
                  <LinePriceDisplay line={line} currency={draft.currency} />
                </td>
                <td className="py-3 pr-3 text-navy">{money(line.itbis, draft.currency)}</td>
                <td className="py-3 pr-3 font-medium text-navy">
                  {money(line.gross, draft.currency)}
                </td>
                {!readOnly && (
                  <td className="py-3">
                    <LineActions
                      line={line}
                      disabled={isMutating}
                      onEdit={() => onEdit(line)}
                      onRemove={() => onRemove(line)}
                    />
                  </td>
                )}
              </tr>
              {line.notes ? (
                <tr className="border-b border-navy-50">
                  <td colSpan={columnCount} className="max-w-0 pb-3 pr-3 pt-0">
                    <InvoiceLineNoteText notes={line.notes} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftLineCards({ draft, readOnly, isMutating, onEdit, onRemove }: DraftLinesProps) {
  return (
    <ul className="flex flex-col gap-3">
      {draft.lines.map((line) => {
        const sku = posLineSku(line);
        return (
          <li key={line.id}>
            <Card padding="sm" className="overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-navy">{line.description}</div>
                  <p className="mt-1 text-sm text-navy-400">
                    {LINE_TYPE_LABELS[line.type]}
                    {sku ? ` · ${sku}` : ''}
                  </p>
                </div>
                {!readOnly && (
                  <LineActions
                    line={line}
                    disabled={isMutating}
                    onEdit={() => onEdit(line)}
                    onRemove={() => onRemove(line)}
                  />
                )}
              </div>
              <InvoiceLineNoteText notes={line.notes} />
              <div className="mt-2 flex flex-wrap gap-1">
                {line.installed && (
                  <RelationChip relationship="INSTALLED" parentName={line.parentName} />
                )}
                {line.isAssembly && <AssemblyKindChip isAssembly />}
              </div>
              <dl className="mt-3 space-y-2 text-sm text-navy">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-navy-400">Cantidad</dt>
                  <dd>{line.quantity}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-navy-400">Precio</dt>
                  <dd>
                    <LinePriceDisplay line={line} currency={draft.currency} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-navy-400">ITBIS</dt>
                  <dd>{money(line.itbis, draft.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 font-medium">
                  <dt>Total</dt>
                  <dd>{money(line.gross, draft.currency)}</dd>
                </div>
              </dl>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function LineDescription({ line }: { line: PosLineView }) {
  return (
    <>
      <div className="font-medium text-navy">{line.description}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {line.installed && <RelationChip relationship="INSTALLED" parentName={line.parentName} />}
        {line.isAssembly && <AssemblyKindChip isAssembly />}
      </div>
    </>
  );
}

function LinePriceDisplay({
  line,
  currency,
}: {
  line: PosLineView;
  currency: PosDraftView['currency'];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span>{money(line.base, currency)}</span>
      {line.pricePending && <span className="text-xs text-amber-700">Precio pendiente</span>}
    </div>
  );
}

function LineActions({
  line,
  disabled,
  onEdit,
  onRemove,
}: {
  line: PosLineView;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <LineActionLink
        label={`Editar ${line.description}`}
        hint="Editar"
        disabled={disabled}
        onClick={onEdit}
      >
        <PencilIcon />
      </LineActionLink>
      <LineActionLink
        label={`Quitar ${line.description}`}
        hint="Quitar"
        disabled={disabled}
        tone="danger"
        onClick={onRemove}
      >
        <TrashIcon />
      </LineActionLink>
    </div>
  );
}

/**
 * Compact icon control: looks like a link, still a button so it runs an action
 * instead of navigating. The hit target is the icon plus a little padding.
 */
function LineActionLink({
  label,
  hint,
  disabled,
  tone = 'default',
  onClick,
  children,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  tone?: 'default' | 'danger';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex cursor-pointer rounded-sm p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-red-600 hover:bg-red-50 hover:text-red-800'
          : 'text-navy-400 hover:bg-navy-50 hover:text-brand'
      }`}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M9 3.75A1.75 1.75 0 0 1 10.75 2h2.5A1.75 1.75 0 0 1 15 3.75V5h4.25a.75.75 0 0 1 0 1.5h-.81l-.84 12.04A2.75 2.75 0 0 1 14.86 21H9.14a2.75 2.75 0 0 1-2.74-2.46L5.56 6.5h-.81a.75.75 0 0 1 0-1.5H9V3.75Zm1.5 1.25h3V3.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V5ZM7.07 6.5l.83 11.92c.06.8.73 1.42 1.54 1.42h5.72c.81 0 1.48-.62 1.54-1.42L17.53 6.5H7.07Z"
      />
    </svg>
  );
}
