export const CONDUCE_PDF_TITLE = 'CONDUCE';
export const CONDUCE_PDF_THANK_YOU =
  'Gracias por elegir Solo Camiones. Apreciamos su confianza y estamos a su disposición para mantener su camión en marcha.';

export function conducePdfFilename(conduceNumber: string): string {
  return `${conduceNumber}.pdf`;
}
