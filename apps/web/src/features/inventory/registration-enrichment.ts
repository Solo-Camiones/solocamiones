import type { AssemblyBaselineEntry, RegisterItemInput } from '../../api/contracts/inventory';
import type { CategoryAttributeDefinition } from '../../api/contracts/entities';
import { pendingAttributeLabels } from '../../shared/domain/category-attributes';

export type RegistrationMode = 'INDIVIDUAL' | 'QUANTITY';

/** Operational labels for data that INV-002 allows after the practical minimum. */
export const ENRICHMENT_LABELS = {
  brand: 'Marca',
  model: 'Modelo',
  serial: 'Serial',
  partNumber: 'Número de parte',
  acquisitionCost: 'Costo de adquisición',
  location: 'Ubicación',
  notes: 'Notas',
  photos: 'Fotos',
} as const;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Lists enrichment still empty after a valid save so the UI can say
 * what to complete later, without inventing extra required fields.
 */
export function pendingEnrichmentLabels(
  mode: RegistrationMode,
  item: Pick<
    RegisterItemInput,
    | 'brand'
    | 'model'
    | 'serial'
    | 'partNumber'
    | 'acquisitionCostDop'
    | 'location'
    | 'attributes'
    | 'notes'
    | 'photos'
  >,
  attributeDefinitions?: CategoryAttributeDefinition[],
): string[] {
  const pending: string[] = [];

  if (!hasText(item.brand)) {
    pending.push(ENRICHMENT_LABELS.brand);
  }
  if (!hasText(item.location)) {
    pending.push(ENRICHMENT_LABELS.location);
  }

  if (mode === 'QUANTITY') {
    return pending;
  }

  if (!hasText(item.model)) {
    pending.push(ENRICHMENT_LABELS.model);
  }
  if (!hasText(item.serial)) {
    pending.push(ENRICHMENT_LABELS.serial);
  }
  if (!hasText(item.partNumber)) {
    pending.push(ENRICHMENT_LABELS.partNumber);
  }
  if (item.acquisitionCostDop == null) {
    pending.push(ENRICHMENT_LABELS.acquisitionCost);
  }
  pending.push(...pendingAttributeLabels(attributeDefinitions, item.attributes));
  if (!hasText(item.notes)) {
    pending.push(ENRICHMENT_LABELS.notes);
  }
  if (!item.photos?.length) {
    pending.push(ENRICHMENT_LABELS.photos);
  }

  return pending;
}

/** Keep already-entered checklist rows when returning to step 2. */
export function mergeBaselineEntries(
  expectedNames: string[],
  previous: AssemblyBaselineEntry[],
): AssemblyBaselineEntry[] {
  const previousByName = new Map(previous.map((entry) => [entry.expectedComponentName, entry]));
  return expectedNames.map(
    (expectedComponentName) =>
      previousByName.get(expectedComponentName) ?? {
        expectedComponentName,
        status: 'MISSING',
      },
  );
}
