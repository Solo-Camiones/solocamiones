import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = `${pathToFileURL(path.join(PDFJS_ROOT, 'standard_fonts')).href}/`;
// Artifacts live at the repo tmp/ folder so they stay out of source and git.
export const PDF_VISUAL_REVIEW_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../tmp/pdf-visual-review',
);

const PAGE_RENDER_SCALE = 2;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

type RasterCanvas = {
  width: number;
  height: number;
  getContext(type: '2d'): RasterCanvasContext;
  toBuffer(mime: 'image/png'): Buffer;
};
type RasterCanvasContext = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

type CanvasAndContext = {
  canvas: RasterCanvas;
  context: RasterCanvasContext;
};

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height) as unknown as RasterCanvas;
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

export type ReviewedPdfDocument = {
  pageCount: number;
  pages: string[];
  fullText: string;
  imagePaths: string[];
  pdfPath: string;
};

export function isPngBuffer(value: Buffer): boolean {
  return value.subarray(0, 4).equals(PNG_SIGNATURE);
}

// pdf.js parses the PDF content stream (real text, not a `%PDF-` magic-byte check)
// and rasterizes pages through a Node canvas. Alternatives would be Poppler/ImageMagick
// (system binaries) or committing golden PNGs without regenerating them in CI.
export async function reviewPdfDocument(
  pdf: Buffer,
  outputDirectory: string,
): Promise<ReviewedPdfDocument> {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Expected a PDF buffer');
  }

  const canvasFactory = new NodeCanvasFactory();
  const document = await getDocument({
    data: new Uint8Array(pdf),
    disableWorker: true,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    CanvasFactory: NodeCanvasFactory,
    // pdf.js types the Node canvas factory and worker flags more narrowly than the runtime API.
  } as Parameters<typeof getDocument>[0]).promise;

  await mkdir(outputDirectory, { recursive: true });
  const pages: string[] = [];
  const imagePaths: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(
      textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replaceAll(/\s+/g, ' ')
        .trim(),
    );

    const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
    const { canvas, context } = canvasFactory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      canvasFactory,
    } as Parameters<(typeof page)['render']>[0]).promise;

    const png = canvas.toBuffer('image/png');
    if (!isPngBuffer(png)) {
      throw new Error(`Page ${pageNumber} did not rasterize to PNG`);
    }

    const imagePath = path.join(outputDirectory, `page-${pageNumber}.png`);
    await writeFile(imagePath, png);
    imagePaths.push(imagePath);
    canvasFactory.destroy({ canvas, context });
  }

  const pdfPath = path.join(outputDirectory, 'document.pdf');
  await writeFile(pdfPath, pdf);
  await writeFile(path.join(outputDirectory, 'extracted-text.txt'), pages.join('\n---PAGE---\n'));

  return {
    pageCount: document.numPages,
    pages,
    fullText: pages.join('\n'),
    imagePaths,
    pdfPath,
  };
}
