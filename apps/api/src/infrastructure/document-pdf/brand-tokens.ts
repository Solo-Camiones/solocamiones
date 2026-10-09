import { fileURLToPath } from 'node:url';

/** Shared Solo Camiones palette for PDF documents. */
export const BRAND_BLUE = '#0e8fd1';
export const BRAND_NAVY = '#0c1e3a';
export const LIGHT_BLUE = '#eaf6fc';
export const MUTED = '#526173';
export const BORDER = '#d6e0e8';

export const LOGO_PATH = fileURLToPath(
  new URL('../../../../web/src/shared/assets/brand/SoloCamionesLogo.png', import.meta.url),
);
