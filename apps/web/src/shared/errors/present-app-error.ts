import type { AppError } from '../auth/types';

export type PresentedError = {
  summary: string;
  fields: Record<string, string>;
};

const COPY = {
  fiscalFormat: 'Debe ser un RNC de 9 dígitos o una cédula de 11 dígitos.',
  fiscalConflict: 'Ya existe un cliente con esta identificación fiscal / cédula.',
  nameRequired: 'El nombre es obligatorio.',
  contactPhoneOrEmail: 'Cada contacto debe tener teléfono o correo.',
  contactPrimary: 'Solo un contacto puede ser principal.',
  emailInvalid: 'El correo no es válido.',
  genericLocked: 'Cliente Contado es el predeterminado y no se puede editar.',
  cashCustomerCreditForbidden: 'A Cliente contado no se le puede vender a crédito',
  fiscalInvoiceIdentity: 'Una factura fiscal requiere un cliente con RNC o cédula.',
  pdfFailed: 'La generación del PDF falló',
  pdfNotReady: 'El PDF de la factura no está disponible',
  pdfCompletedOnly: 'Solo las facturas confirmadas tienen PDF',
  pdfRegenerateFailedOnly: 'Solo se puede regenerar el PDF de una factura con generación fallida',
  profitDopFormat: 'La ganancia bruta debe ser un decimal con como máximo 2 decimales.',
  manualProfitCompletedOnly: 'Solo se puede registrar ganancia bruta en facturas completadas',
  calculatedProfitExists: 'Esta factura ya tiene ganancia bruta calculada a partir del costo',
  pendingFxManualProfit:
    'Reintente primero el cálculo con la tasa de cambio; no registre un monto mientras esté pendiente',
  fxRetryCompletedUsdOnly: 'Solo se puede reintentar rentabilidad en facturas en dólares completadas',
  fxRetryNotPending: 'Esta factura no tiene rentabilidad pendiente de tasa de cambio',
  fxRetryRateUnavailable: 'Tasa de cambio histórica no disponible para la fecha de confirmación',
  inventoryLinesUnavailable:
    'Las líneas de inventario no están disponibles. Esta factura no puede crear, reservar ni consumir stock.',
  fixedLineQuantity: 'Este tipo de línea no permite cambiar la cantidad.',
  duplicateDelivery: 'El borrador ya tiene una línea de entrega.',
  inactiveService: 'Ese servicio está inactivo y no se puede agregar al borrador.',
  atLeastOneField: 'Indique al menos un dato para actualizar.',
  currentPassword: 'La contraseña actual es incorrecta.',
  passwordMustDiffer: 'La nueva contraseña debe ser diferente de la actual.',
  passwordChangeRequired: 'Debe cambiar su contraseña desde Mi perfil para continuar.',
} as const;

/**
 * Exact API and mock messages. Unknown server text is never shown to the operator.
 * Keys must stay in sync with backend customer/auth constants.
 */
const KNOWN_TEXT: Record<string, { text: string; field?: string }> = {
  'Fiscal identifier must be a 9-digit RNC or 11-digit Cédula': {
    text: COPY.fiscalFormat,
    field: 'rnc',
  },
  'A customer with this fiscal identifier already exists': {
    text: COPY.fiscalConflict,
    field: 'rnc',
  },
  'Name is required': { text: COPY.nameRequired, field: 'name' },
  'Each contact must include a phone or email': { text: COPY.contactPhoneOrEmail },
  'Only one contact can be primary': { text: COPY.contactPrimary, field: 'contacts' },
  'At least one field is required': { text: COPY.atLeastOneField },
  'Cliente contado cannot be edited': { text: COPY.genericLocked },
  'A Cliente contado no se le puede vender a crédito': { text: COPY.cashCustomerCreditForbidden },
  'Current password is incorrect': { text: COPY.currentPassword },
  'New password must differ from current password': { text: COPY.passwordMustDiffer },
  'El nombre es obligatorio': { text: COPY.nameRequired, field: 'name' },
  'El correo no es válido': { text: COPY.emailInvalid },
  'Cada contacto debe tener teléfono o correo': { text: COPY.contactPhoneOrEmail },
  'Solo un contacto puede ser principal': { text: COPY.contactPrimary, field: 'contacts' },
  'Cliente Contado es el predeterminado y no se puede editar': { text: COPY.genericLocked },
  'A fiscal invoice requires a customer with RNC or Cédula': {
    text: COPY.fiscalInvoiceIdentity,
    field: 'fiscal',
  },
  'La generación del PDF falló': { text: COPY.pdfFailed },
  'El PDF de la factura no está disponible': { text: COPY.pdfNotReady },
  'Solo las facturas confirmadas tienen PDF': { text: COPY.pdfCompletedOnly },
  'Solo se puede regenerar el PDF de una factura con generación fallida': {
    text: COPY.pdfRegenerateFailedOnly,
  },
  'Must be a decimal with at most 2 decimal places': {
    text: COPY.profitDopFormat,
    field: 'profitDop',
  },
  'Solo se puede registrar ganancia bruta en facturas completadas': {
    text: COPY.manualProfitCompletedOnly,
  },
  'Esta factura ya tiene ganancia bruta calculada a partir del costo': {
    text: COPY.calculatedProfitExists,
  },
  'Reintente primero el cálculo con la tasa de cambio; no registre un monto mientras esté pendiente': {
    text: COPY.pendingFxManualProfit,
  },
  'Solo se puede reintentar rentabilidad en facturas en dólares completadas': {
    text: COPY.fxRetryCompletedUsdOnly,
  },
  'Esta factura no tiene rentabilidad pendiente de tasa de cambio': {
    text: COPY.fxRetryNotPending,
  },
  'Tasa de cambio histórica no disponible para la fecha de confirmación': {
    text: COPY.fxRetryRateUnavailable,
  },
  'Inventory-backed lines are not available; this invoice cannot create, reserve, or consume stock': {
    text: COPY.inventoryLinesUnavailable,
  },
  'This line type has a fixed quantity of 1': { text: COPY.fixedLineQuantity },
  'A draft can have at most one DELIVERY line': { text: COPY.duplicateDelivery },
  'Inactive catalog services cannot be added to a draft': { text: COPY.inactiveService },
};

const FIELD_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^name$/, label: 'nombre' },
  { pattern: /^rnc$/, label: 'identificación fiscal / cédula' },
  { pattern: /^address$/, label: 'dirección' },
  { pattern: /^notes$/, label: 'notas' },
  { pattern: /^profitDop$/, label: 'ganancia bruta' },
  { pattern: /^contacts$/, label: 'contactos' },
  { pattern: /^contacts\.\d+$/, label: 'contacto' },
  { pattern: /^contacts\.\d+\.email$/, label: 'correo del contacto' },
  { pattern: /^contacts\.\d+\.phone$/, label: 'teléfono del contacto' },
  { pattern: /^contacts\.\d+\.name$/, label: 'nombre del contacto' },
  { pattern: /^contacts\.\d+\.title$/, label: 'cargo del contacto' },
];

type PresentInput = {
  details?: Record<string, unknown>;
  fallbackMessage: string;
  serverMessage?: string;
};

function fieldLabel(path: string): string | undefined {
  return FIELD_LABELS.find((entry) => entry.pattern.test(path))?.label;
}

function translateKnown(message: string): { text: string; field?: string } | undefined {
  return KNOWN_TEXT[message];
}

/** Path-only fallback for known customer fields when Zod uses a default English message. */
function translateByPath(path: string): { text: string; field: string } | undefined {
  if (path === 'rnc') return { text: COPY.fiscalFormat, field: path };
  if (path === 'name') return { text: COPY.nameRequired, field: path };
  if (path === 'contacts') return { text: COPY.contactPrimary, field: path };
  if (/^contacts\.\d+$/.test(path)) return { text: COPY.contactPhoneOrEmail, field: path };
  if (/\.email$/.test(path)) return { text: COPY.emailInvalid, field: path };
  return undefined;
}

function readIssues(details: Record<string, unknown> | undefined): Array<{ path: string; message: string }> {
  const raw = details?.issues;
  if (!Array.isArray(raw)) return [];

  const issues: Array<{ path: string; message: string }> = [];
  for (const issue of raw) {
    if (!issue || typeof issue !== 'object') continue;
    const path = 'path' in issue && typeof issue.path === 'string' ? issue.path : '';
    const message = 'message' in issue && typeof issue.message === 'string' ? issue.message : '';
    if (message) issues.push({ path, message });
  }
  return issues;
}

function summarize(fields: Record<string, string>): string {
  const messages = [...new Set(Object.values(fields))];
  if (messages.length === 1) return messages[0]!;

  const labels = [
    ...new Set(
      Object.keys(fields)
        .map((path) => fieldLabel(path))
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (labels.length === 0) return messages.join(' ');
  return `Revise: ${labels.join(', ')}.`;
}

function presentFromIssues(issues: Array<{ path: string; message: string }>): PresentedError | undefined {
  const fields: Record<string, string> = {};

  for (const issue of issues) {
    const known = translateKnown(issue.message);
    const mapped = known
      ? { text: known.text, field: known.field ?? (fieldLabel(issue.path) ? issue.path : undefined) }
      : fieldLabel(issue.path)
        ? translateByPath(issue.path)
        : undefined;
    if (!mapped?.field) continue;
    if (!fields[mapped.field]) fields[mapped.field] = mapped.text;
  }

  if (Object.keys(fields).length === 0) return undefined;
  return { summary: summarize(fields), fields };
}

function presentFromKnownMessage(message: string | undefined): PresentedError | undefined {
  if (!message) return undefined;
  const known = translateKnown(message);
  if (!known) return undefined;
  const fields = known.field ? { [known.field]: known.text } : {};
  return { summary: known.text, fields };
}

/**
 * Turns a structured AppError into operator-facing Spanish copy.
 * Unrecognized server text stays behind the generic fallback.
 */
export function presentError(input: PresentInput): PresentedError {
  if (input.details?.reason === 'PASSWORD_CHANGE_REQUIRED') {
    return { summary: COPY.passwordChangeRequired, fields: {} };
  }

  const fromIssues = presentFromIssues(readIssues(input.details));
  if (fromIssues) return fromIssues;

  const fromServer = presentFromKnownMessage(input.serverMessage);
  if (fromServer) return fromServer;

  const fromFallback = presentFromKnownMessage(input.fallbackMessage);
  if (fromFallback) return fromFallback;

  return { summary: input.fallbackMessage, fields: {} };
}

export function presentAppError(error: AppError): PresentedError {
  return presentError({
    details: error.details,
    fallbackMessage: error.message,
    serverMessage: error.message,
  });
}
