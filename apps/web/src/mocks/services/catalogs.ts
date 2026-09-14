import type { SaveCategoryInput, SaveServiceInput } from '../../api/contracts/catalogs';
import type { AppState, Category, Service } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { parseAttributeDefinitions } from '../../shared/domain/category-attributes';
import { normalizeCodePrefix } from './item-code';

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function catalogNameKey(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

function slugFromName(name: string, maxLength: number): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase()
    .slice(0, maxLength);

  return ascii || 'NEW';
}

function uniquePrefixedId(existing: string[], prefix: string, slug: string): string {
  const base = `${prefix}-${slug}`;
  if (!existing.includes(base)) {
    return base;
  }

  let index = 2;
  let candidate = `${base}-${index}`;
  while (existing.includes(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

export function nextCategoryId(categories: Category[], name: string): string {
  return uniquePrefixedId(
    categories.map((category) => category.id),
    'CAT',
    slugFromName(name, 8),
  );
}

export function nextServiceId(services: Service[], name: string): string {
  return uniquePrefixedId(
    services.map((service) => service.id),
    'SVC',
    slugFromName(name, 8),
  );
}

/**
 * Checklist templates are keyed by name. A repeated name would create two
 * indistinguishable slots, so it is rejected instead of silently dropped.
 */
function parseExpectedComponents(input: string[] | undefined): Result<string[]> {
  const names = (input ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const seen = new Set<string>();
  for (const name of names) {
    const key = catalogNameKey(name);
    if (seen.has(key)) {
      return err({
        code: 'VALIDATION',
        message: `El componente esperado «${name}» ya está en la lista`,
      });
    }
    seen.add(key);
  }

  return ok(names);
}

export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function sortServices(services: Service[]): Service[] {
  return [...services].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'es');
  });
}

/**
 * Validates category definitions. Catalog edits never create inventory identities.
 */
export function prepareCategorySave(
  categories: Category[],
  input: SaveCategoryInput,
): Result<Category> {
  const name = optionalText(input.name);
  if (!name) {
    return err({ code: 'VALIDATION', message: 'El nombre de la categoría es obligatorio' });
  }

  const existing = input.id ? categories.find((category) => category.id === input.id) : undefined;
  if (input.id && !existing) {
    return err({ code: 'NOT_FOUND', message: 'Categoría no encontrada' });
  }

  let codePrefix: string;
  if (existing) {
    codePrefix = existing.codePrefix;
  } else {
    const prefixResult = normalizeCodePrefix(input.codePrefix);
    if (!prefixResult.ok) {
      return prefixResult;
    }
    codePrefix = prefixResult.value;
    const duplicatePrefix = categories.some(
      (category) => category.codePrefix.toLocaleUpperCase() === codePrefix,
    );
    if (duplicatePrefix) {
      return err({ code: 'CONFLICT', message: `El prefijo ${codePrefix} ya está en uso` });
    }
  }

  const duplicateName = categories.some(
    (category) =>
      category.id !== input.id && catalogNameKey(category.name) === catalogNameKey(name),
  );
  if (duplicateName) {
    return err({ code: 'CONFLICT', message: 'Ya existe una categoría con ese nombre' });
  }

  const expectedComponentsResult = parseExpectedComponents(input.expectedComponents);
  if (!expectedComponentsResult.ok) {
    return expectedComponentsResult;
  }
  const previousSpelling = new Map(
    (existing?.expectedComponents ?? []).map((componentName) => [
      catalogNameKey(componentName),
      componentName,
    ]),
  );
  const categorySpelling = new Map(
    [...categories.map((category) => category.name), name].map((categoryName) => [
      catalogNameKey(categoryName),
      categoryName,
    ]),
  );
  const expectedComponents = expectedComponentsResult.value.map(
    (componentName) =>
      previousSpelling.get(catalogNameKey(componentName)) ??
      categorySpelling.get(catalogNameKey(componentName)) ??
      componentName,
  );
  if (input.isAssembly && expectedComponents.length === 0) {
    return err({
      code: 'VALIDATION',
      message: 'Una categoría de ensamblaje necesita al menos un componente esperado',
    });
  }

  const attributesResult =
    input.attributes !== undefined
      ? parseAttributeDefinitions(input.attributes)
      : ok(existing?.attributes);
  if (!attributesResult.ok) {
    return attributesResult;
  }

  return ok({
    id: existing?.id ?? nextCategoryId(categories, name),
    name,
    codePrefix,
    isAssembly: input.isAssembly,
    expectedComponents: input.isAssembly ? expectedComponents : undefined,
    ...(attributesResult.value ? { attributes: attributesResult.value } : {}),
  });
}

function migrateCategoryName(value: string, previousName: string, nextName: string): string {
  return catalogNameKey(value) === catalogNameKey(previousName) ? nextName : value;
}

function hasDuplicateNames(values: string[]): boolean {
  const keys = values.map(catalogNameKey);
  return new Set(keys).size !== keys.length;
}

function hasDuplicateParentNames(entries: { parentId: string; expectedComponentName: string }[]) {
  const keys = entries.map(
    (entry) => `${entry.parentId}\u0000${catalogNameKey(entry.expectedComponentName)}`,
  );
  return new Set(keys).size !== keys.length;
}

/**
 * Builds an all-or-nothing category edit. Operational references use category
 * names in the prototype, so a rename must migrate them in the same commit.
 */
export function prepareCategoryStateChange(
  state: AppState,
  category: Category,
): Result<AppState> {
  const previous = state.categories.find((entry) => entry.id === category.id);
  if (!previous) {
    const staged = structuredClone(state);
    staged.categories.push(category);
    staged.itemCodeSeq = { ...staged.itemCodeSeq, [category.id]: 1 };
    return ok(staged);
  }

  if (previous.isAssembly !== category.isAssembly) {
    const isReferenced =
      state.items.some((item) => item.categoryId === category.id) ||
      state.qtyProducts.some((product) => product.categoryId === category.id);
    if (isReferenced) {
      return err({
        code: 'CONFLICT',
        message: 'No se puede cambiar el tipo de una categoría que ya tiene inventario',
      });
    }
  }

  const staged = structuredClone(state);
  const categoryIndex = staged.categories.findIndex((entry) => entry.id === category.id);
  staged.categories[categoryIndex] = category;

  if (previous.name === category.name) {
    return ok(staged);
  }

  staged.categories = staged.categories.map((entry) => ({
    ...entry,
    expectedComponents: entry.expectedComponents?.map((componentName) =>
      migrateCategoryName(componentName, previous.name, category.name),
    ),
  }));
  staged.knownMissing = staged.knownMissing.map((entry) => ({
    ...entry,
    expectedComponentName: migrateCategoryName(
      entry.expectedComponentName,
      previous.name,
      category.name,
    ),
  }));
  staged.pendingCatalogReviews = staged.pendingCatalogReviews.map((entry) => ({
    ...entry,
    expectedComponentName: migrateCategoryName(
      entry.expectedComponentName,
      previous.name,
      category.name,
    ),
  }));

  if (
    staged.categories.some((entry) => hasDuplicateNames(entry.expectedComponents ?? [])) ||
    hasDuplicateParentNames(staged.knownMissing) ||
    hasDuplicateParentNames(staged.pendingCatalogReviews)
  ) {
    return err({
      code: 'CONFLICT',
      message: 'El nuevo nombre entra en conflicto con una referencia de catálogo existente',
    });
  }

  return ok(staged);
}

export function prepareServiceSave(services: Service[], input: SaveServiceInput): Result<Service> {
  const existing = 'id' in input
    ? services.find((service) => service.id === input.id)
    : undefined;
  if ('id' in input && !existing) {
    return err({ code: 'NOT_FOUND', message: 'Servicio no encontrado' });
  }
  if ('id' in input && input.name === undefined && input.active === undefined) {
    return err({ code: 'VALIDATION', message: 'No hay cambios para guardar' });
  }

  const name = input.name === undefined ? existing?.name : optionalText(input.name);
  if (!name) {
    return err({ code: 'VALIDATION', message: 'El nombre del servicio es obligatorio' });
  }

  const duplicateName = services.some(
    (service) =>
      service.name.toLowerCase() === name.toLowerCase() && service.id !== existing?.id,
  );
  if (duplicateName) {
    return err({ code: 'CONFLICT', message: 'Ya existe un servicio con ese nombre' });
  }

  return ok({
    id: existing?.id ?? nextServiceId(services, name),
    name,
    active: input.active ?? existing?.active ?? true,
  });
}
