export const QUOTE_PDF_TITLE = 'COTIZACIÓN';
export const QUOTE_PDF_INTERNAL_NOTICE =
  'Documento interno. No es un comprobante fiscal DGII.';
export const QUOTE_PDF_THANK_YOU =
  'Gracias por elegir Solo Camiones. Apreciamos su confianza y estamos a su disposición para mantener su camión en marcha.';

export function quotePdfFilename(quoteNumber: string): string {
  return `${quoteNumber}.pdf`;
}
