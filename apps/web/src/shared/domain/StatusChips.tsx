import type { ReactNode } from 'react';
import type { PaymentState } from '../../api/contracts/entities';

import { UX_TERMS } from '../copy/glossary';
import { Chip } from '../ui';
import {
  assemblyKindLabel,
  commercialAvailabilityLabel,
  commercialAvailabilityLayer,
  completenessLabel,
  isIncompleteException,
  physicalRelationLabel,
  type CommercialDisplayState,
  type PhysicalDisplayRelationship,
} from './status-hierarchy';

function ContextText({ children }: { children: string }) {
  return <span className="text-xs text-navy-500">{children}</span>;
}

export function CommercialChip({
  state,
  size = 'sm',
}: {
  state: CommercialDisplayState;
  size?: 'sm' | 'md';
}) {
  const label = commercialAvailabilityLabel(state);

  if (commercialAvailabilityLayer(state) === 'primary') {
    return (
      <span
        className={
          size === 'md' ? 'text-lg font-semibold text-navy' : 'text-sm font-semibold text-navy'
        }
      >
        {label}
      </span>
    );
  }

  if (state === 'SOLD') {
    return <Chip tone="danger">{label}</Chip>;
  }

  return <Chip tone="amber">{label}</Chip>;
}

export function RelationChip({
  relationship,
  parentName,
}: {
  relationship?: PhysicalDisplayRelationship;
  parentName?: string;
}) {
  return <ContextText>{physicalRelationLabel(relationship, parentName)}</ContextText>;
}

export function PhysicalWorkChip({
  type,
  status,
}: {
  type?: 'DISMANTLING' | 'INSTALLATION';
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}) {
  if (!type || (status !== 'PENDING' && status !== 'IN_PROGRESS')) {
    return null;
  }

  const action = type === 'DISMANTLING' ? UX_TERMS.dismantling : 'Instalación';
  const phase = status === 'IN_PROGRESS' ? 'en proceso' : 'pendiente';

  return <Chip tone="amber">{`${action} ${phase}`}</Chip>;
}

export function AssemblyKindChip({ isAssembly }: { isAssembly?: boolean }) {
  const label = assemblyKindLabel(isAssembly);
  if (!label) {
    return null;
  }

  return <ContextText>{label}</ContextText>;
}

export function CompleteChip({ complete }: { complete?: boolean }) {
  if (!isIncompleteException(complete)) {
    return null;
  }

  return <Chip tone="amber">Incompleto</Chip>;
}

export function ReservationChip({
  reserved,
  draftId,
  compact = false,
}: {
  reserved: boolean;
  draftId?: string;
  compact?: boolean;
}) {
  if (!reserved) {
    return null;
  }

  const label = !compact && draftId ? `Reservado (${draftId})` : 'Reservado';
  return <Chip tone="amber">{label}</Chip>;
}

export function NoDesarmarChip({
  active,
  rootId,
  compact = false,
}: {
  active: boolean;
  rootId?: string;
  compact?: boolean;
}) {
  if (!active) {
    return null;
  }

  const showRoot = !compact && rootId && rootId.length > 0;
  return <Chip tone="danger">{showRoot ? `No desarmar · ${rootId}` : 'No desarmar'}</Chip>;
}

function StatusFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-medium leading-5 text-navy-400">{label}</dt>
      <dd className="min-w-0 leading-5 text-navy">{children}</dd>
    </>
  );
}

export function InventoryStatusCluster({
  commercialState,
  physicalRelationship,
  parentName,
  isAssembly,
  complete,
  reserved,
  reservedByDraftId,
  noDesarmar,
  protectedRootId,
  compact = false,
  includePhysicalContext = true,
  layout,
  stockLine,
  extra,
}: {
  commercialState: CommercialDisplayState;
  physicalRelationship?: PhysicalDisplayRelationship;
  parentName?: string;
  isAssembly?: boolean;
  complete?: boolean;
  reserved: boolean;
  reservedByDraftId?: string;
  noDesarmar: boolean;
  protectedRootId?: string;
  compact?: boolean;
  includePhysicalContext?: boolean;
  layout?: 'stack' | 'inline' | 'panel';
  stockLine?: string;
  extra?: ReactNode;
}) {
  const resolvedLayout = layout ?? (compact ? 'stack' : 'panel');
  const physical = physicalRelationLabel(physicalRelationship, parentName);
  const showAlerts =
    (resolvedLayout !== 'panel' && isIncompleteException(complete)) || reserved || noDesarmar;
  const alerts = (
    <>
      {resolvedLayout !== 'panel' ? <CompleteChip complete={complete} /> : null}
      <ReservationChip
        reserved={reserved}
        draftId={reservedByDraftId}
        compact={compact || resolvedLayout !== 'panel'}
      />
      <NoDesarmarChip
        active={noDesarmar}
        rootId={protectedRootId}
        compact={compact || resolvedLayout !== 'panel'}
      />
      {extra}
    </>
  );

  if (resolvedLayout === 'inline') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <CommercialChip state={commercialState} />
        {includePhysicalContext && (
          <>
            <span className="text-navy-200" aria-hidden>
              ·
            </span>
            <span className="text-xs text-navy-500">{physical}</span>
          </>
        )}
        {(showAlerts || extra) && <div className="flex flex-wrap gap-1">{alerts}</div>}
      </div>
    );
  }

  const completeness =
    resolvedLayout === 'panel' && isAssembly ? completenessLabel(complete) : null;
  const wide = resolvedLayout === 'panel';

  return (
    <dl
      className={`grid min-w-[12.5rem] items-baseline gap-x-3 ${
        wide
          ? 'grid-cols-[6.5rem_minmax(0,1fr)] gap-y-3'
          : 'grid-cols-[4.5rem_minmax(0,1fr)] gap-y-1.5'
      }`}
    >
      {wide && (
        <StatusFact label="Tipo">
          <span className="text-sm text-navy">{isAssembly ? UX_TERMS.assembly : 'Pieza'}</span>
        </StatusFact>
      )}
      <StatusFact label="Comercial">
        <CommercialChip state={commercialState} size={wide ? 'md' : 'sm'} />
      </StatusFact>
      {includePhysicalContext && (
        <StatusFact label="Físico">
          <span className={wide ? 'text-sm text-navy' : 'text-xs text-navy-600'}>{physical}</span>
        </StatusFact>
      )}
      {completeness && (
        <StatusFact label="Completitud">
          <span
            className={
              complete === false ? 'text-sm font-medium text-amber-900' : 'text-sm text-navy'
            }
          >
            {completeness}
          </span>
        </StatusFact>
      )}
      {stockLine && (
        <StatusFact label="Stock">
          <span className="text-xs text-navy-600">{stockLine}</span>
        </StatusFact>
      )}
      {(showAlerts || extra) && (
        <StatusFact label="Atención">
          <div className="flex flex-wrap gap-1.5">{alerts}</div>
        </StatusFact>
      )}
    </dl>
  );
}

export function InvoiceStatusChip({ status }: { status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' }) {
  if (status === 'DRAFT') {
    return <Chip tone="amber">Borrador</Chip>;
  }
  if (status === 'CANCELLED') {
    return <Chip tone="danger">Cancelada</Chip>;
  }
  return <Chip tone="success">Completada</Chip>;
}

export function PaymentChip({ state }: { state: PaymentState }) {
  if (state === 'CANCELLED') return <Chip tone="danger">Cancelada</Chip>;
  if (state === 'OVERDUE') return <Chip tone="danger">Vencida</Chip>;
  if (state === 'PAID_LATE') return <Chip tone="amber">Pagada con retraso</Chip>;
  if (state === 'PENDING') return <Chip tone="amber">Pendiente</Chip>;
  if (state === 'PAID') {
    return <Chip tone="success">Pagada</Chip>;
  }
  if (state === 'PARTIALLY_PAID') {
    return <Chip tone="amber">Pago parcial</Chip>;
  }
  return <Chip tone="danger">Sin pagar</Chip>;
}

export function WOTypeChip({ type }: { type: 'DISMANTLING' | 'INSTALLATION' }) {
  return (
    <span className="text-sm text-navy-500">
      {type === 'INSTALLATION' ? 'Instalación' : UX_TERMS.dismantling}
    </span>
  );
}

export function WOStatusChip({
  status,
}: {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}) {
  if (status === 'IN_PROGRESS') {
    return <Chip tone="amber">En proceso</Chip>;
  }
  if (status === 'COMPLETED') {
    return <Chip tone="success">Completada</Chip>;
  }
  if (status === 'CANCELLED') {
    return <Chip tone="danger">Cancelada</Chip>;
  }
  return <Chip tone="neutral">Pendiente</Chip>;
}

export function AccountStateChip({ active }: { active: boolean }) {
  if (active) {
    return <span className="text-sm text-navy">Activo</span>;
  }

  return <Chip tone="amber">Inactivo</Chip>;
}
