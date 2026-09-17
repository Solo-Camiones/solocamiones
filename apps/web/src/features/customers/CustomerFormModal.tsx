import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { Customer, CustomerType, CreditTermDays } from '../../api/contracts/entities';
import {
  CREDIT_TERM_DAYS_OPTIONS,
  type SaveCustomerContactInput,
  type SaveCustomerInput,
} from '../../api/contracts/customers';
import {
  formatFiscalId,
  inferFiscalIdKind,
  maskFiscalIdInput,
  type FiscalIdKind,
} from '../../shared/domain/fiscal-id';
import { formatDominicanPhone } from '../../shared/domain/phone';
import {
  Button,
  Field,
  GuardedModal,
  Info,
  Input,
  ReviewSummary,
  Select,
  Textarea,
  isFormDirty,
} from '../../shared/ui';
import { customerTypeLabel } from './customer-type-labels';

export type CustomerFormModalProps = {
  open: boolean;
  customer: Customer | null;
  canManageCredit: boolean;
  isSaving: boolean;
  error: string | null;
  fieldErrors?: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: SaveCustomerInput) => void;
};

type ContactDraft = {
  key: string;
  id?: string;
  name: string;
  phone: string;
  email: string;
  title: string;
  isPrimary: boolean;
};

type FormFields = {
  name: string;
  customerType: CustomerType;
  creditLimitDop: string;
  creditTermDays: string;
  fiscalKind: '' | FiscalIdKind;
  rnc: string;
  address: string;
  notes: string;
  contacts: ContactDraft[];
};

const EMPTY_FIELDS: FormFields = {
  name: '',
  customerType: 'CASH',
  creditLimitDop: '',
  creditTermDays: '',
  fiscalKind: '',
  rnc: '',
  address: '',
  notes: '',
  contacts: [],
};

function fiscalLabel(kind: '' | FiscalIdKind): string {
  if (kind === 'RNC') return 'RNC';
  if (kind === 'CEDULA') return 'Cédula';
  return 'Identificación fiscal / cédula';
}

function toSaveContacts(drafts: ContactDraft[]): SaveCustomerContactInput[] {
  return drafts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    title: contact.title,
    isPrimary: contact.isPrimary || undefined,
  }));
}

function firstError(
  fieldErrors: Record<string, string> | undefined,
  keys: string[],
): string | undefined {
  if (!fieldErrors) return undefined;
  for (const key of keys) {
    if (fieldErrors[key]) return fieldErrors[key];
  }
  return undefined;
}

export function CustomerFormModal({
  open,
  customer,
  canManageCredit,
  isSaving,
  error,
  fieldErrors,
  onClose,
  onSubmit,
}: CustomerFormModalProps) {
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [baseline, setBaseline] = useState<FormFields>(EMPTY_FIELDS);
  const [clearedFields, setClearedFields] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'form' | 'review'>('form');
  const nextKeyRef = useRef(0);
  const isEdit = customer != null;

  useEffect(() => {
    if (!open) {
      return;
    }

    nextKeyRef.current = 0;
    const next: FormFields = customer
      ? {
          name: customer.name,
          customerType: customer.customerType,
          creditLimitDop: customer.creditLimitDop ?? '',
          creditTermDays: customer.creditTermDays ? String(customer.creditTermDays) : '',
          fiscalKind: inferFiscalIdKind(customer.rnc),
          rnc: customer.rnc ? formatFiscalId(customer.rnc) : '',
          address: customer.address ?? '',
          notes: customer.notes ?? '',
          contacts: customer.contacts.map((contact) => {
            nextKeyRef.current += 1;
            return {
              key: contact.id || `contact-draft-${nextKeyRef.current}`,
              id: contact.id,
              name: contact.name ?? '',
              phone: formatDominicanPhone(contact.phone ?? ''),
              email: contact.email ?? '',
              title: contact.title ?? '',
              isPrimary: contact.isPrimary === true,
            };
          }),
        }
      : EMPTY_FIELDS;
    setFields(next);
    setBaseline(next);
    setClearedFields(new Set());
    setStep('form');
  }, [open, customer]);

  useEffect(() => {
    setClearedFields(new Set());
  }, [error, fieldErrors]);

  function visibleError(keys: string[]): string | undefined {
    return firstError(
      fieldErrors,
      keys.filter((key) => !clearedFields.has(key)),
    );
  }

  function clearFieldError(...keys: string[]) {
    setClearedFields((current) => {
      const next = new Set(current);
      for (const key of keys) next.add(key);
      return next;
    });
  }

  function addContact() {
    nextKeyRef.current += 1;
    setFields((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        {
          key: `contact-draft-${nextKeyRef.current}`,
          name: '',
          phone: '',
          email: '',
          title: '',
          isPrimary: current.contacts.length === 0,
        },
      ],
    }));
    clearFieldError('contacts');
  }

  function updateContact(key: string, index: number, patch: Partial<ContactDraft>) {
    const touched = Object.keys(patch).map((field) => `contacts.${index}.${field}`);
    if (patch.phone !== undefined || patch.email !== undefined) {
      touched.push(`contacts.${index}`);
    }
    if (patch.isPrimary !== undefined) {
      touched.push('contacts');
    }
    clearFieldError(...touched);
    setFields((current) => ({
      ...current,
      contacts: current.contacts.map((contact) => {
        if (contact.key !== key) {
          if (patch.isPrimary === true) {
            return { ...contact, isPrimary: false };
          }
          return contact;
        }
        return { ...contact, ...patch };
      }),
    }));
  }

  function removeContact(key: string) {
    clearFieldError(
      'contacts',
      ...Object.keys(fieldErrors ?? {}).filter((field) => field.startsWith('contacts.')),
    );
    setFields((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.key !== key),
    }));
  }

  const isCredit = canManageCredit && fields.customerType === 'CREDIT';

  function savePayload(): SaveCustomerInput {
    const payload: SaveCustomerInput = {
      id: customer?.id,
      name: fields.name,
      rnc: fields.rnc,
      address: fields.address,
      notes: fields.notes,
      contacts: toSaveContacts(fields.contacts),
    };

    if (canManageCredit) {
      payload.customerType = fields.customerType;
      if (fields.customerType === 'CREDIT') {
        payload.creditLimitDop = fields.creditLimitDop.trim();
        payload.creditTermDays = Number(fields.creditTermDays) as CreditTermDays;
      }
    }

    return payload;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isEdit && step === 'form') {
      if (!event.currentTarget.reportValidity()) {
        return;
      }
      setStep('review');
      return;
    }
    onSubmit(savePayload());
  }

  return (
    <GuardedModal
      open={open}
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Info tone="error" title="No se pudo guardar">
            {error}
          </Info>
        )}
        {step === 'review' && !isEdit ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-navy">Revisa los datos antes de crear el cliente.</p>
            <ReviewSummary
              rows={[
                { label: 'Nombre', value: fields.name },
                ...(canManageCredit
                  ? [
                      { label: 'Tipo', value: customerTypeLabel(fields.customerType) },
                      ...(fields.customerType === 'CREDIT'
                        ? [
                            { label: 'Límite de crédito (DOP)', value: fields.creditLimitDop },
                            {
                              label: 'Plazo (días)',
                              value: fields.creditTermDays,
                            },
                          ]
                        : []),
                    ]
                  : []),
                { label: fiscalLabel(fields.fiscalKind), value: fields.rnc },
                { label: 'Dirección', value: fields.address },
                { label: 'Notas', value: fields.notes },
                ...(fields.contacts.length === 0 ? [{ label: 'Contactos', value: '' }] : []),
              ]}
            >
              {fields.contacts.length > 0 && (
                <div className="space-y-3">
                  {fields.contacts.map((contact, index) => (
                    <div key={contact.key} className="space-y-2">
                      <p className="text-sm font-medium text-navy">Contacto {index + 1}</p>
                      <ReviewSummary
                        rows={[
                          { label: 'Nombre', value: contact.name },
                          { label: 'Teléfono', value: contact.phone },
                          { label: 'Correo', value: contact.email },
                          { label: 'Cargo', value: contact.title },
                          { label: 'Principal', value: contact.isPrimary ? 'Sí' : 'No' },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </ReviewSummary>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('form')}
                disabled={isSaving}
              >
                Volver a editar
              </Button>
              <Button type="button" disabled={isSaving} onClick={() => onSubmit(savePayload())}>
                {isSaving ? 'Guardando…' : 'Confirmar creación'}
              </Button>
            </div>
          </div>
        ) : (
          <>
        <Field label="Nombre" htmlFor="customer-name" error={visibleError(['name'])}>
          <Input
            id="customer-name"
            value={fields.name}
            onChange={(event) => {
              clearFieldError('name');
              setFields((current) => ({ ...current, name: event.target.value }));
            }}
            required
            autoFocus
          />
        </Field>
        {canManageCredit && (
          <Field label="Tipo de cliente" htmlFor="customer-type" error={visibleError(['customerType'])}>
            <Select
              id="customer-type"
              value={fields.customerType}
              onChange={(event) => {
                clearFieldError('customerType', 'creditLimitDop', 'creditTermDays', 'rnc');
                const customerType = event.target.value as CustomerType;
                setFields((current) => ({
                  ...current,
                  customerType,
                  ...(customerType === 'CASH'
                    ? { creditLimitDop: '', creditTermDays: '' }
                    : {}),
                }));
              }}
            >
              <option value="CASH">Contado</option>
              <option value="CREDIT">Crédito</option>
            </Select>
          </Field>
        )}
        {isCredit && (
          <>
            <Field
              label="Límite de crédito (DOP)"
              htmlFor="customer-credit-limit"
              error={visibleError(['creditLimitDop'])}
            >
              <Input
                id="customer-credit-limit"
                inputMode="decimal"
                value={fields.creditLimitDop}
                onChange={(event) => {
                  clearFieldError('creditLimitDop');
                  setFields((current) => ({ ...current, creditLimitDop: event.target.value }));
                }}
                required
              />
            </Field>
            <Field
              label="Plazo de crédito (días)"
              htmlFor="customer-credit-term"
              error={visibleError(['creditTermDays'])}
            >
              <Select
                id="customer-credit-term"
                value={fields.creditTermDays}
                onChange={(event) => {
                  clearFieldError('creditTermDays');
                  setFields((current) => ({ ...current, creditTermDays: event.target.value }));
                }}
                required
              >
                <option value="" disabled>
                  Seleccione un plazo
                </option>
                {CREDIT_TERM_DAYS_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} días
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <div className="space-y-1.5">
          <div
            id="customer-fiscal-kind"
            role="radiogroup"
            aria-label="Tipo de identificación"
            aria-required={isCredit || undefined}
            aria-invalid={
              !fields.fiscalKind && Boolean(visibleError(['rnc'])) ? true : undefined
            }
            className="flex items-center gap-3"
          >
            <label className="flex items-center gap-1.5 text-xs font-medium text-navy-500">
              <input
                type="radio"
                name="customer-fiscal-kind"
                value="RNC"
                checked={fields.fiscalKind === 'RNC'}
                required={isCredit}
                className="h-3.5 w-3.5 accent-brand"
                onChange={() => {
                  clearFieldError('rnc');
                  setFields((current) => ({ ...current, fiscalKind: 'RNC', rnc: '' }));
                }}
              />
              RNC
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-navy-500">
              <input
                type="radio"
                name="customer-fiscal-kind"
                value="CEDULA"
                checked={fields.fiscalKind === 'CEDULA'}
                required={isCredit}
                className="h-3.5 w-3.5 accent-brand"
                onChange={() => {
                  clearFieldError('rnc');
                  setFields((current) => ({ ...current, fiscalKind: 'CEDULA', rnc: '' }));
                }}
              />
              Cédula
            </label>
          </div>
          {!fields.fiscalKind && visibleError(['rnc']) ? (
            <p className="text-xs text-red-600" role="alert">
              {visibleError(['rnc'])}
            </p>
          ) : null}
          <Field
            label="Identificación fiscal / cédula"
            htmlFor="customer-rnc"
            hint={
              fields.fiscalKind === 'RNC'
                ? '9 dígitos, por ejemplo 1-31-12345-6'
                : fields.fiscalKind === 'CEDULA'
                  ? '11 dígitos, por ejemplo 001-0123456-7'
                  : 'Elija RNC o cédula para habilitar el campo'
            }
            error={fields.fiscalKind ? visibleError(['rnc']) : undefined}
          >
            <Input
              id="customer-rnc"
              inputMode="numeric"
              autoComplete="off"
              disabled={!fields.fiscalKind}
              value={fields.rnc}
              onChange={(event) => {
                if (!fields.fiscalKind) return;
                clearFieldError('rnc');
                setFields((current) => ({
                  ...current,
                  rnc: maskFiscalIdInput(current.fiscalKind as FiscalIdKind, event.target.value),
                }));
              }}
              required={isCredit}
              placeholder={
                fields.fiscalKind === 'RNC'
                  ? '1-31-12345-6'
                  : fields.fiscalKind === 'CEDULA'
                    ? '001-0123456-7'
                    : undefined
              }
            />
          </Field>
        </div>
        <Field label="Dirección" htmlFor="customer-address" error={visibleError(['address'])}>
          <Input
            id="customer-address"
            value={fields.address}
            onChange={(event) => {
              clearFieldError('address');
              setFields((current) => ({ ...current, address: event.target.value }));
            }}
          />
        </Field>
        <Field label="Notas" htmlFor="customer-notes" error={visibleError(['notes'])}>
          <Textarea
            id="customer-notes"
            rows={3}
            value={fields.notes}
            onChange={(event) => {
              clearFieldError('notes');
              setFields((current) => ({ ...current, notes: event.target.value }));
            }}
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy">Contactos</p>
            <Button type="button" variant="secondary" size="sm" onClick={addContact}>
              Agregar contacto
            </Button>
          </div>
          {visibleError(['contacts']) && (
            <p className="text-xs text-red-600" role="alert">
              {visibleError(['contacts'])}
            </p>
          )}

          {fields.contacts.map((contact, index) => (
            <div
              key={contact.key}
              className="space-y-3 rounded-lg border border-navy-100 bg-navy-50/40 p-3"
            >
              <Field
                label="Nombre del contacto"
                htmlFor={`contact-${index}-name`}
                hint="Opcional si el contacto es la misma persona"
                error={visibleError([`contacts.${index}.name`])}
              >
                <Input
                  id={`contact-${index}-name`}
                  value={contact.name}
                  onChange={(event) =>
                    updateContact(contact.key, index, { name: event.target.value })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Teléfono"
                  htmlFor={`contact-${index}-phone`}
                  error={visibleError([`contacts.${index}.phone`, `contacts.${index}`])}
                >
                  <Input
                    id={`contact-${index}-phone`}
                    inputMode="numeric"
                    autoComplete="tel"
                    value={contact.phone}
                    onChange={(event) =>
                      updateContact(contact.key, index, {
                        phone: formatDominicanPhone(event.target.value),
                      })
                    }
                    placeholder="809-555-0100"
                  />
                </Field>
                <Field
                  label="Correo"
                  htmlFor={`contact-${index}-email`}
                  error={visibleError([`contacts.${index}.email`, `contacts.${index}`])}
                >
                  <Input
                    id={`contact-${index}-email`}
                    type="email"
                    value={contact.email}
                    onChange={(event) =>
                      updateContact(contact.key, index, { email: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field
                  label="Cargo"
                  htmlFor={`contact-${index}-title`}
                  error={visibleError([`contacts.${index}.title`])}
                >
                  <Input
                    id={`contact-${index}-title`}
                    value={contact.title}
                    onChange={(event) =>
                      updateContact(contact.key, index, { title: event.target.value })
                    }
                  />
                </Field>
                <label
                  htmlFor={`contact-${index}-primary`}
                  className="flex h-10 items-center gap-2 text-sm text-navy"
                >
                  <input
                    id={`contact-${index}-primary`}
                    type="checkbox"
                    checked={contact.isPrimary}
                    onChange={(event) =>
                      updateContact(contact.key, index, { isPrimary: event.target.checked })
                    }
                  />
                  Principal
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeContact(contact.key)}
                >
                  Quitar
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
          </>
        )}
      </form>
      )}
    </GuardedModal>
  );
}
