import type { LineType } from '../../api/contracts/entities';
import { UX_TERMS } from '../copy/glossary';

/**
 * Frontend visibility follows `docs/DEVELOPMENT_PLAN.md`.
 * Presets are cumulative: release-N includes every earlier confirmed release.
 * Release 3B (Accounts Payable) stays off until that spec is CONFIRMED — there is no preset for it.
 *
 * | Capability            | Front surfaces                                      | Backend release |
 * |-----------------------|-----------------------------------------------------|-----------------|
 * | users                 | `/users`                                            | 1 Access        |
 * | customers             | `/customers`                                        | 2 Billing       |
 * | sales                 | `/sales`, POS GENERIC/SERVICE/DELIVERY/EXTERNAL     | 2 Billing       |
 * | profitability         | `/profitability`, panel admin en factura            | 2 Billing       |
 * | payments              | Registrar pago, CxC `/receivables`, detalle de factura | 3 Payments/CxC  |
 * | invoiceCancellation   | Cancelar factura / reembolso de cancelación         | 3 Payments/CxC  |
 * | inventory             | `/inventory` piezas independientes y por cantidad   | 4 Base stock    |
 * | catalogs              | `/catalogs` servicios (R2 HTTP); categorías en R4   | 2 services / 4 categories |
 * | inventorySales        | Líneas ITEM independientes, agregar a borrador      | 5 Reservations  |
 * | quantitySales         | Líneas QTY, agregar producto por cantidad           | 5 Reservations  |
 * | hierarchy             | Baseline, ensamblajes, No desarmar, árbol recepción | 6 Hierarchy     |
 * | workOrders            | `/work-orders`, app mecánico, OT manual             | 7 Work orders   |
 * | recovery              | `/recovery`                                         | 8 Recovery      |
 * | prototypeControls     | DemoControls / credenciales demo                    | never in prod   |
 */
export type AppCapability =
  | 'users'
  | 'customers'
  | 'sales'
  | 'profitability'
  | 'payments'
  | 'invoiceCancellation'
  | 'inventory'
  | 'catalogs'
  | 'inventorySales'
  | 'quantitySales'
  | 'hierarchy'
  | 'workOrders'
  | 'recovery'
  | 'prototypeControls';

export type AppCapabilities = Record<AppCapability, boolean>;

/** Matches Development Plan production slices. `prototype` is the full demo UI, not a production release. */
export type CapabilityPreset =
  | 'release-1'
  | 'release-2'
  | 'release-3'
  | 'release-4'
  | 'release-5'
  | 'release-6'
  | 'release-7'
  | 'release-8'
  | 'prototype';

const DISABLED: AppCapabilities = {
  users: false,
  customers: false,
  sales: false,
  profitability: false,
  payments: false,
  invoiceCancellation: false,
  inventory: false,
  catalogs: false,
  inventorySales: false,
  quantitySales: false,
  hierarchy: false,
  workOrders: false,
  recovery: false,
  prototypeControls: false,
};

/** Flags introduced in each Development Plan release (not including earlier ones). */
const RELEASE_INTRODUCTIONS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, Partial<AppCapabilities>> = {
  1: { users: true },
  2: { customers: true, sales: true, profitability: true },
  3: { payments: true, invoiceCancellation: true },
  4: { inventory: true, catalogs: true },
  5: { inventorySales: true, quantitySales: true },
  6: { hierarchy: true },
  7: { workOrders: true },
  8: { recovery: true },
};

function withFlags(flags: Partial<AppCapabilities>): AppCapabilities {
  return { ...DISABLED, ...flags };
}

function capabilitiesThroughRelease(upTo: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): AppCapabilities {
  const flags: Partial<AppCapabilities> = {};
  for (const release of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    if (release > upTo) {
      break;
    }
    Object.assign(flags, RELEASE_INTRODUCTIONS[release]);
  }
  return withFlags(flags);
}

export const CAPABILITY_PRESETS: Record<CapabilityPreset, AppCapabilities> = {
  'release-1': capabilitiesThroughRelease(1),
  'release-2': capabilitiesThroughRelease(2),
  'release-3': capabilitiesThroughRelease(3),
  'release-4': capabilitiesThroughRelease(4),
  'release-5': capabilitiesThroughRelease(5),
  'release-6': capabilitiesThroughRelease(6),
  'release-7': capabilitiesThroughRelease(7),
  'release-8': capabilitiesThroughRelease(8),
  prototype: withFlags({
    ...capabilitiesThroughRelease(8),
    prototypeControls: true,
  }),
};

const POS_LINE_TYPE_CAPABILITY: Record<LineType, AppCapability> = {
  ITEM: 'inventorySales',
  QTY: 'quantitySales',
  GENERIC: 'sales',
  EXTERNAL: 'sales',
  SERVICE: 'sales',
  DELIVERY: 'sales',
};

export const POS_LINE_TYPE_OPTIONS: { value: LineType; label: string }[] = [
  { value: 'ITEM', label: UX_TERMS.piece },
  { value: 'QTY', label: UX_TERMS.quantityItem },
  { value: 'GENERIC', label: 'Mercancía genérica' },
  { value: 'EXTERNAL', label: 'Reventa externa' },
  { value: 'SERVICE', label: 'Servicio mecánico' },
  { value: 'DELIVERY', label: 'Entrega' },
];

const PRESET_VALUES: CapabilityPreset[] = [
  'release-1',
  'release-2',
  'release-3',
  'release-4',
  'release-5',
  'release-6',
  'release-7',
  'release-8',
  'prototype',
];

export function parseCapabilityPreset(value: string | undefined): CapabilityPreset {
  if (value && PRESET_VALUES.includes(value as CapabilityPreset)) {
    return value as CapabilityPreset;
  }

  return 'prototype';
}

/**
 * Resolves the active capability set.
 * `prototypeControls` stays off in production builds unless explicitly forced,
 * even when the prototype preset keeps later-release product screens visible.
 */
export function resolveCapabilities(
  env: Pick<
    ImportMetaEnv,
    'VITE_CAPABILITIES_PRESET' | 'VITE_ENABLE_DEMO_CONTROLS' | 'VITE_USE_MOCK_API'
  > & {
    DEV?: boolean;
  } = import.meta.env,
): AppCapabilities {
  // HTTP mode exposes modules whose API swap has landed, including payments/CxC.
  // `catalogs` is on for mechanical services; `/catalogs` hides inventory categories until R4.
  // Dashboard KPIs are not swapped in R2.
  if (env.VITE_USE_MOCK_API !== 'true') {
    return {
      ...DISABLED,
      users: true,
      customers: true,
      catalogs: true,
      sales: true,
      profitability: true,
      payments: true,
      invoiceCancellation: true,
    };
  }
  const presetName = parseCapabilityPreset(env.VITE_CAPABILITIES_PRESET);
  const preset = CAPABILITY_PRESETS[presetName];
  const forceDemo = env.VITE_ENABLE_DEMO_CONTROLS === 'true';
  const forbidDemo = env.VITE_ENABLE_DEMO_CONTROLS === 'false';

  if (forbidDemo) {
    return { ...preset, prototypeControls: false };
  }

  if (presetName === 'prototype') {
    return {
      ...preset,
      prototypeControls: forceDemo || env.DEV === true,
    };
  }

  return { ...preset, prototypeControls: forceDemo };
}

const resolvedCapabilities = resolveCapabilities();

export function getAppCapabilities(): AppCapabilities {
  return resolvedCapabilities;
}

export function isLineTypeEnabled(type: LineType, capabilities: AppCapabilities): boolean {
  return capabilities[POS_LINE_TYPE_CAPABILITY[type]];
}

export function enabledPosLineTypes(
  capabilities: AppCapabilities,
): { value: LineType; label: string }[] {
  return POS_LINE_TYPE_OPTIONS.filter((entry) => isLineTypeEnabled(entry.value, capabilities));
}
