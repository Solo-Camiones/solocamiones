import { useRef } from 'react';

import type { InvoiceDetailView } from '../../api/contracts/sales';
import { APP_NAME } from '../../shared/config/brand';
import { formatFiscalId } from '../../shared/domain/fiscal-id';
import { Button, currencyLabel, Modal, money, Mono } from '../../shared/ui';
import { InvoiceLinesTable } from './InvoiceLinesTable';

export type SalesDocumentKind = 'invoice' | 'quote';

export type DocumentPdfPreviewFile = {
  url: string;
  filename: string;
};

export type PdfPreviewModalProps = {
  open: boolean;
  kind: SalesDocumentKind;
  detail?: InvoiceDetailView;
  pdfFile?: DocumentPdfPreviewFile;
  onClose: () => void;
};

const BLANK_NCF = 'NCF: ______________________';

function previewTitle(kind: SalesDocumentKind): string {
  return kind === 'quote' ? 'Vista previa de cotización' : 'Vista previa de factura';
}

export function PdfPreviewModal({
  open,
  kind,
  detail,
  pdfFile,
  onClose,
}: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const baseTotal = detail?.lines.reduce((sum, line) => sum + line.base, 0) ?? 0;
  const itbisTotal = detail?.lines.reduce((sum, line) => sum + line.itbis, 0) ?? 0;

  function downloadPdf() {
    if (!pdfFile) return;
    const link = document.createElement('a');
    link.href = pdfFile.url;
    link.download = pdfFile.filename;
    link.click();
  }

  function printPreview() {
    if (pdfFile) {
      iframeRef.current?.contentWindow?.print();
      return;
    }
    window.print();
  }

  return (
    <Modal open={open} title={previewTitle(kind)} onClose={onClose} size="lg">
      {pdfFile ? (
        <div className="space-y-4">
          <header className="flex items-start justify-between gap-4 border-b border-navy-100 pb-4">
            <div>
              <p className="text-lg font-bold tracking-[0.16em] text-navy">{APP_NAME}</p>
              <p className="text-xs text-navy-400">Importadora de repuestos nuevos y usados</p>
            </div>
            {detail?.number || detail?.quoteNumber ? (
              <div className="text-right">
                <Mono className="text-base font-semibold">{detail.number ?? detail.quoteNumber}</Mono>
                {kind === 'invoice' ? (
                  <p className="mt-1 font-mono text-sm text-navy">{BLANK_NCF}</p>
                ) : null}
              </div>
            ) : null}
          </header>
          <iframe
            ref={iframeRef}
            title={pdfFile.filename}
            src={pdfFile.url}
            className="h-[70vh] w-full rounded border border-navy-100 bg-white"
          />
        </div>
      ) : kind === 'invoice' && detail ? (
        <div className="space-y-6 print:text-black" id="invoice-pdf-preview">
          <header className="flex items-start justify-between gap-4 border-b border-navy-100 pb-4">
            <div>
              <p className="text-lg font-bold tracking-[0.16em] text-navy">{APP_NAME}</p>
              <p className="text-xs text-navy-400">Importadora de repuestos nuevos y usados</p>
            </div>
            <div className="text-right">
              <Mono className="text-base font-semibold">{detail.number}</Mono>
              <p className="mt-1 font-mono text-sm text-navy">{BLANK_NCF}</p>
            </div>
          </header>

          <div className="grid gap-2 text-sm text-navy sm:grid-cols-2">
            <p>
              Cliente: <span className="font-medium">{detail.customerName}</span>
            </p>
            <p>Identificación fiscal / cédula: {formatFiscalId(detail.customerRnc) || '—'}</p>
            <p>Moneda: {currencyLabel(detail.currency)}</p>
            <p>
              {detail.fiscal
                ? 'Factura con comprobante fiscal'
                : 'Sin comprobante fiscal'}
              {detail.applyItbis ? ' · ITBIS 18% sobre subtotal' : ''}
            </p>
          </div>

          <InvoiceLinesTable lines={detail.lines} currency={detail.currency} />

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-navy-400">Subtotal</span>
              <span className="font-mono">{money(baseTotal, detail.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-navy-400">ITBIS</span>
              <span className="font-mono">{money(itbisTotal, detail.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold text-navy">
              <span>Total</span>
              <span className="font-mono">{money(detail.total, detail.currency)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-navy-400">No hay documento para mostrar.</p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        {pdfFile ? (
          <Button variant="secondary" onClick={downloadPdf}>
            Descargar
          </Button>
        ) : null}
        <Button onClick={printPreview}>Imprimir</Button>
      </div>
    </Modal>
  );
}
