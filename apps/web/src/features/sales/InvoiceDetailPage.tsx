import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { InvoiceStatusChip, PaymentChip } from '../../shared/domain';
import { can } from '../../shared/auth/policies';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { Button, Card, Chip, Info, money, Mono, Skeleton } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { BackToSalesLink } from './BackToSalesLink';
import { CancelInvoiceModal } from './CancelInvoiceModal';
import { CurrencyCorrectionModal } from './CurrencyCorrectionModal';
import { InvoiceHistory } from './InvoiceHistory';
import { InvoiceLinesTable } from './InvoiceLinesTable';
import { PaymentHistory } from './PaymentHistory';
import { PdfPreviewModal } from './PdfPreviewModal';
import { PayModal } from './PayModal';
import { ProfitabilityPanel } from './ProfitabilityPanel';
import { useInvoiceDetail } from './useInvoiceDetail';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const capabilities = useAppCapabilities();
  const {
    result,
    isMutating,
    addPayment,
    cancelInvoice,
    correctCurrency,
    getInvoicePdf,
    regenerateInvoicePdf,
  } = useInvoiceDetail(id);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<{ url: string; filename: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function revokePdfFile() {
    setPdfFile((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar la factura">
        {result.error.message}
      </Info>
    );
  }

  if (result.status === 'loading') {
    return <Skeleton label="Cargando factura" lines={6} />;
  }

  const detail = result.detail;
  const canViewProfit = can(user, 'profit.view');
  const canManageWorkOrders = can(user, 'workOrders.manage');

  return (
    <>
      <PageHeader
        leading={<BackToSalesLink />}
        title={detail.number ?? 'Factura'}
        description={`${detail.customerName}${detail.customerRnc ? ` · ${detail.customerRnc}` : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {detail.actions.canViewPdf && (
              <Button
                variant="secondary"
                disabled={isMutating}
                onClick={async () => {
                  setActionError(null);
                  if (detail.document?.status === 'READY') {
                    const response = await getInvoicePdf(detail.id);
                    if (!response.ok) {
                      setActionError(response.error.message);
                      return;
                    }
                    revokePdfFile();
                    setPdfFile({
                      url: URL.createObjectURL(response.value.blob),
                      filename: response.value.filename,
                    });
                  }
                  setPdfOpen(true);
                }}
              >
                Vista previa del documento
              </Button>
            )}
            {detail.actions.canRegeneratePdf && can(user, 'recovery.manage') && (
              <Button
                variant="secondary"
                disabled={isMutating}
                onClick={async () => {
                  setActionError(null);
                  const response = await regenerateInvoicePdf(detail.id);
                  if (!response.ok) {
                    setActionError(response.error.message);
                  }
                }}
              >
                Regenerar documento
              </Button>
            )}
            {detail.actions.canPay && can(user, 'sales.manage') && capabilities.payments && (
              <Button
                onClick={() => {
                  setActionError(null);
                  setPayOpen(true);
                }}
              >
                Registrar pago
              </Button>
            )}
            {detail.actions.canCorrectCurrency && can(user, 'sales.correctCurrency') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActionError(null);
                  setCurrencyOpen(true);
                }}
              >
                Corregir moneda
              </Button>
            )}
            {detail.actions.canCancel &&
              can(user, 'sales.cancel') &&
              capabilities.invoiceCancellation && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setActionError(null);
                    setCancelOpen(true);
                  }}
                >
                  Cancelar factura
                </Button>
              )}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <InvoiceStatusChip status={detail.status} />
        {detail.status === 'COMPLETED' &&
          capabilities.payments &&
          detail.paymentState !== 'PENDING' &&
          detail.paymentState !== 'UNPAID' && (
            <PaymentChip state={detail.paymentState} />
          )}
        {detail.fiscal ? <Chip tone="brand">Fiscal</Chip> : <Chip>Sin comprobante fiscal</Chip>}
        <Chip>{detail.currency}</Chip>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Total</p>
          <p className="mt-1 font-mono text-xl text-navy">{money(detail.total, detail.currency)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Pagado</p>
          <p className="mt-1 font-mono text-xl text-navy">{money(detail.paid, detail.currency)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Saldo</p>
          <p className="mt-1 font-mono text-xl text-navy">
            {money(detail.balance, detail.currency)}
          </p>
        </Card>
      </div>

      {actionError && !payOpen && !cancelOpen && !currencyOpen && (
        <div className="mb-6">
          <Info tone="error" title="No se pudo completar la operación">
            {actionError}
          </Info>
        </div>
      )}

      {detail.document?.status === 'FAILED' && (
        <div className="mb-6">
          <Info tone="error" title="No se pudo generar el documento">
            La generación del PDF falló.
            {detail.document.errorId ? ` Referencia: ${detail.document.errorId}` : ''}
          </Info>
        </div>
      )}

      {detail.cancelReason && (
        <div className="mb-6">
          <Info tone="warning" title="Motivo de cancelación">
            {detail.cancelReason}
          </Info>
        </div>
      )}

      <div className="mb-8">
        <InvoiceLinesTable lines={detail.lines} currency={detail.currency} />
      </div>

      {detail.deliveredAssemblies && detail.deliveredAssemblies.length > 0 && (
        <section className="mb-8">
          <p className="mb-2 text-sm font-medium text-navy">Ensamblajes entregados</p>
          {detail.deliveredAssemblies.map((assembly) => (
            <ul key={assembly.rootItemId} className="mb-2 space-y-1 text-sm text-navy-400">
              {assembly.nodes.map((node) => (
                <li key={node.itemId}>
                  <Mono>{node.itemId}</Mono> {node.name}
                  {node.parentId ? (
                    <>
                      {' '}
                      · padre <Mono>{node.parentId}</Mono>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}
        </section>
      )}

      {detail.linkedWorkOrders.length > 0 && capabilities.workOrders && (
        <section className="mb-8">
          <p className="mb-2 text-sm font-medium text-navy">Órdenes de trabajo vinculadas</p>
          <ul className="space-y-1 text-sm text-navy-400">
            {detail.linkedWorkOrders.map((order) => (
              <li key={order.id}>
                {canManageWorkOrders ? (
                  <Link to={`/work-orders/${order.id}`} className="text-brand hover:underline">
                    <Mono>{order.id}</Mono>
                  </Link>
                ) : (
                  <Mono>{order.id}</Mono>
                )}{' '}
                · {order.pieceName} · {order.status}
              </li>
            ))}
          </ul>
        </section>
      )}

      {capabilities.payments && (
        <div className="mb-8">
          <PaymentHistory payments={detail.payments} currency={detail.currency} />
        </div>
      )}

      {detail.profitability && canViewProfit && capabilities.profitability && (
        <div className="mb-8">
          <ProfitabilityPanel view={detail.profitability} />
        </div>
      )}

      <InvoiceHistory events={detail.history} />

      <PayModal
        open={payOpen}
        invoiceId={detail.id}
        currency={detail.currency}
        balance={detail.balance}
        confirmedAt={detail.confirmedAt}
        isSaving={isMutating}
        error={payOpen ? actionError : null}
        onClose={() => {
          if (!isMutating) {
            setPayOpen(false);
            setActionError(null);
          }
        }}
        onSubmit={async (input) => {
          const response = await addPayment({ invoiceId: detail.id, ...input });
          if (!response.ok) {
            setActionError(response.error.message);
            return;
          }
          setPayOpen(false);
        }}
      />

      <CancelInvoiceModal
        open={cancelOpen}
        paid={detail.paid - detail.refunded}
        currency={detail.currency}
        workOrders={detail.linkedWorkOrders}
        isSaving={isMutating}
        error={cancelOpen ? actionError : null}
        onClose={() => {
          if (!isMutating) {
            setCancelOpen(false);
            setActionError(null);
          }
        }}
        onSubmit={async (input) => {
          const response = await cancelInvoice({ invoiceId: detail.id, ...input });
          if (!response.ok) {
            setActionError(response.error.message);
            return;
          }
          setCancelOpen(false);
        }}
      />

      <CurrencyCorrectionModal
        open={currencyOpen}
        current={detail.currency}
        isSaving={isMutating}
        error={currencyOpen ? actionError : null}
        onClose={() => {
          if (!isMutating) {
            setCurrencyOpen(false);
            setActionError(null);
          }
        }}
        onSubmit={async (input) => {
          const response = await correctCurrency({ invoiceId: detail.id, ...input });
          if (!response.ok) {
            setActionError(response.error.message);
            return;
          }
          setCurrencyOpen(false);
        }}
      />

      <PdfPreviewModal
        open={pdfOpen}
        detail={detail}
        pdfFile={pdfFile ?? undefined}
        onClose={() => {
          setPdfOpen(false);
          revokePdfFile();
        }}
      />
    </>
  );
}
