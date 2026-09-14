import type { CategoryAttributeDefinition, CategoryAttributeType } from '../../api/contracts/entities';
import { err, ok, type Result } from '../auth/types';

/** CAT-001: a small bounded set, not a generic metadata platform. */
export const MAX_CATEGORY_ATTRIBUTES = 8;

export const CATEGORY_ATTRIBUTE_TYPES: readonly CategoryAttributeType[] = ['text', 'number', 'select'];

const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export function categoryAttributeTypeLabel(type: CategoryAttributeType): string {
  switch (type) {
    case 'text':
      return 'Texto';
    case 'number':
      return 'Número';
    case 'select':
      return 'Lista';
  }
}

export function suggestAttributeKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .slice(0, 32);
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isAttributeType(value: string): value is CategoryAttributeType {
  return (CATEGORY_ATTRIBUTE_TYPES as readonly string[]).includes(value);
}

/**
 * Normalizes Administrator-maintained attribute definitions.
 * Rejects duplicate keys, unknown types, and oversized catalogs.
 */
export function parseAttributeDefinitions(
  input: CategoryAttributeDefinition[] | undefined,
): Result<CategoryAttributeDefinition[] | undefined> {
  const rows = input ?? [];
  if (rows.length > MAX_CATEGORY_ATTRIBUTES) {
    return err({
      code: 'VALIDATION',
      message: `Una categoría admite como máximo ${MAX_CATEGORY_ATTRIBUTES} atributos`,
    });
  }

  const seenKeys = new Set<string>();
  const definitions: CategoryAttributeDefinition[] = [];

  for (const row of rows) {
    const label = optionalText(row.label);
    const key = optionalText(row.key)?.toLowerCase();
    if (!label || !key) {
      return err({
        code: 'VALIDATION',
        message: 'Cada atributo necesita clave y etiqueta',
      });
    }
    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      return err({
        code: 'VALIDATION',
        message: `La clave «${key}» debe empezar con letra y usar solo minúsculas, números o _`,
      });
    }
    if (seenKeys.has(key)) {
      return err({
        code: 'VALIDATION',
        message: `El atributo «${key}» está repetido`,
      });
    }
    if (!isAttributeType(row.type)) {
      return err({
        code: 'VALIDATION',
        message: `El tipo de atributo «${row.type}» no está permitido`,
      });
    }

    seenKeys.add(key);
    const definition: CategoryAttributeDefinition = { key, label, type: row.type };
    if (row.required) {
      definition.required = true;
    }

    if (row.type === 'select') {
      const options = (row.options ?? []).map((option) => option.trim()).filter(Boolean);
      if (options.length === 0) {
        return err({
          code: 'VALIDATION',
          message: `El atributo «${label}» necesita al menos una opción`,
        });
      }
      const optionKeys = options.map((option) => option.toLocaleLowerCase('es'));
      if (new Set(optionKeys).size !== optionKeys.length) {
        return err({
          code: 'VALIDATION',
          message: `El atributo «${label}» tiene opciones repetidas`,
        });
      }
      definition.options = options;
    }

    definitions.push(definition);
  }

  return ok(definitions.length > 0 ? definitions : undefined);
}

function validateAttributeValue(
  definition: CategoryAttributeDefinition,
  raw: string | undefined,
): Result<string | undefined> {
  const value = optionalText(raw);
  if (!value) {
    if (definition.required) {
      return err({
        code: 'VALIDATION',
        message: `${definition.label} es obligatorio para esta categoría`,
      });
    }
    return ok(undefined);
  }

  if (definition.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return err({
        code: 'VALIDATION',
        message: `${definition.label} debe ser un número válido`,
      });
    }
    return ok(value);
  }

  if (definition.type === 'select') {
    if (!definition.options?.includes(value)) {
      return err({
        code: 'VALIDATION',
        message: `${definition.label} debe ser una de las opciones configuradas`,
      });
    }
  }

  return ok(value);
}

/**
 * Validates submitted values against the category schema.
 * Unknown keys are rejected. Historical keys no longer in the schema can be
 * preserved on edit so catalog changes do not erase recorded facts.
 */
export function applyCategoryAttributes(
  definitions: CategoryAttributeDefinition[] | undefined,
  submitted: Record<string, string> | undefined,
  preserveUnknown?: Record<string, string>,
): Result<Record<string, string> | undefined> {
  const defs = definitions ?? [];
  const allowed = new Set(defs.map((definition) => definition.key));
  const incoming = submitted ?? {};

  for (const key of Object.keys(incoming)) {
    if (!allowed.has(key)) {
      return err({
        code: 'VALIDATION',
        message: `El atributo «${key}» no pertenece a esta categoría`,
      });
    }
  }

  const next: Record<string, string> = {};
  if (preserveUnknown) {
    for (const [key, value] of Object.entries(preserveUnknown)) {
      const kept = optionalText(value);
      if (!allowed.has(key) && kept) {
        next[key] = kept;
      }
    }
  }

  for (const definition of defs) {
    const validated = validateAttributeValue(definition, incoming[definition.key]);
    if (!validated.ok) {
      return validated;
    }
    if (validated.value) {
      next[definition.key] = validated.value;
    }
  }

  return ok(Object.keys(next).length > 0 ? next : undefined);
}

export function pendingAttributeLabels(
  definitions: CategoryAttributeDefinition[] | undefined,
  values: Record<string, string> | undefined,
): string[] {
  return (definitions ?? [])
    .filter((definition) => !optionalText(values?.[definition.key]))
    .map((definition) => definition.label);
}

export function labeledAttributeEntries(
  definitions: CategoryAttributeDefinition[] | undefined,
  values: Record<string, string> | undefined,
): { key: string; label: string; value: string }[] {
  const recorded = values ?? {};
  const seen = new Set<string>();
  const entries: { key: string; label: string; value: string }[] = [];

  for (const definition of definitions ?? []) {
    const value = optionalText(recorded[definition.key]);
    if (!value) {
      continue;
    }
    seen.add(definition.key);
    entries.push({ key: definition.key, label: definition.label, value });
  }

  for (const [key, raw] of Object.entries(recorded)) {
    const value = optionalText(raw);
    if (!value || seen.has(key)) {
      continue;
    }
    entries.push({ key, label: key, value });
  }

  return entries;
}
