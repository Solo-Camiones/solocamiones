import PDFDocument from 'pdfkit';

export type PdfDocument = InstanceType<typeof PDFDocument>;

type RenderPdfBufferOptions = {
  margin: number;
  title: string;
  subject?: string;
  write: (document: PdfDocument) => void;
};

/** Create a LETTER PDFDocument, run `write`, and collect the stream into a Buffer. */
export function renderPdfBuffer(options: RenderPdfBufferOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      compress: false,
      size: 'LETTER',
      margin: options.margin,
      bufferPages: true,
    });
    document.info.Title = options.title;
    if (options.subject !== undefined) {
      document.info.Subject = options.subject;
    }
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    options.write(document);
    document.end();
  });
}
