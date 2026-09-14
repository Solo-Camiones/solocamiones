import { z } from 'zod';

const role = z.enum(['ADMINISTRATOR', 'SELLER', 'MECHANIC']);
const actor = z.discriminatedUnion('actorType', [
  z.object({ actorType: z.literal('USER'), actorUserId: z.uuid() }).strict(),
  z.object({ actorType: z.literal('ANONYMOUS'), actorUserId: z.null() }).strict(),
  z.object({ actorType: z.literal('SYSTEM'), actorUserId: z.null() }).strict(),
]);
const profile = z
  .object({
    name: z.string(),
    username: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();
const base = { subjectType: z.literal('USER'), subjectId: z.uuid(), actor };
const customerBase = { subjectType: z.literal('CUSTOMER'), subjectId: z.uuid(), actor };
const serviceBase = { subjectType: z.literal('MECHANICAL_SERVICE'), subjectId: z.uuid(), actor };
const invoiceBase = { subjectType: z.literal('INVOICE'), subjectId: z.uuid(), actor };
const invoiceDraftSnapshot = z
  .object({
    status: z.literal('DRAFT'),
    number: z.null(),
    currency: z.enum(['DOP', 'USD']),
    fiscal: z.boolean(),
    customerId: z.uuid(),
  })
  .strict();
const invoiceCustomerSnapshot = z
  .object({
    name: z.string(),
    rnc: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();
const invoiceConfirmedSnapshot = z
  .object({
    status: z.literal('COMPLETED'),
    number: z.string(),
    currency: z.enum(['DOP', 'USD']),
    fiscal: z.boolean(),
    customerId: z.uuid(),
    customerSnapshot: invoiceCustomerSnapshot,
    totals: z
      .object({
        gross: z.string(),
        base: z.string(),
        itbis: z.string(),
      })
      .strict(),
    confirmedAt: z.string(),
    dueDate: z.iso.date(),
    confirmedByUserId: z.uuid(),
    confirmedByName: z.string().min(1),
  })
  .strict();
const invoiceFxProvenanceSnapshot = z
  .object({
    exchangeRateDopPerUsd: z.string(),
    source: z.string(),
    rateUpdatedAt: z.string(),
    obtainedAt: z.string(),
  })
  .strict();
const invoiceLineSnapshot = z
  .object({
    id: z.uuid(),
    type: z.enum(['GENERIC', 'SERVICE', 'DELIVERY', 'EXTERNAL', 'ITEM', 'QTY']),
    description: z.string(),
    notes: z.preprocess((value) => (value === undefined ? null : value), z.string().nullable()),
    quantity: z.string(),
    unitPrice: z.string(),
    acquisitionCostDop: z.string().nullable(),
    costProvenance: z.enum(['ACTUAL', 'ESTIMATED', 'UNKNOWN']).nullable(),
    serviceId: z.uuid().nullable(),
  })
  .strict();
const serviceSnapshot = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    active: z.boolean(),
  })
  .strict();
const customerSnapshot = z
  .object({
    name: z.string(),
    rnc: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    isDefault: z.boolean(),
    contacts: z.array(
      z
        .object({
          name: z.string().nullable(),
          phone: z.string().nullable(),
          email: z.string().nullable(),
          title: z.string().nullable(),
          isPrimary: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
const recovery = { requestId: z.uuid(), before: z.literal('PENDING') };

export const historyEventSchema = z
  .discriminatedUnion('eventType', [
    z
      .object({
        ...base,
        eventType: z.literal('USER_CREATED'),
        payload: profile
          .extend({
            role,
            active: z.boolean(),
            mustChangePassword: z.boolean(),
            source: z.enum(['ADMINISTRATION', 'BOOTSTRAP_CLI']),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_ROLE_CHANGED'),
        payload: z.object({ before: role, after: role }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_ACTIVATED'),
        payload: z.object({ before: z.literal(false), after: z.literal(true) }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_DEACTIVATED'),
        payload: z.object({ before: z.literal(true), after: z.literal(false) }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_PROFILE_CHANGED'),
        payload: z.object({ before: profile, after: profile }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_PASSWORD_CHANGED'),
        payload: z
          .object({ wasChangeRequired: z.boolean(), mustChangePassword: z.literal(false) })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_RECOVERY_REQUESTED'),
        payload: z
          .object({ requestId: z.uuid(), expiresAt: z.iso.datetime(), after: z.literal('PENDING') })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_RECOVERY_APPROVED'),
        payload: z
          .object({
            ...recovery,
            after: z.literal('APPROVED'),
            identityVerified: z.literal(true),
            mustChangePassword: z.literal(true),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_RECOVERY_REJECTED'),
        payload: z.object({ ...recovery, after: z.literal('REJECTED') }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_RECOVERY_EXPIRED'),
        payload: z.object({ ...recovery, after: z.literal('EXPIRED') }).strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        eventType: z.literal('USER_RECOVERY_CANCELLED'),
        payload: z
          .object({
            ...recovery,
            after: z.literal('CANCELLED'),
            reason: z.enum(['USER_DEACTIVATED', 'PASSWORD_CHANGED']),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...customerBase,
        eventType: z.literal('CUSTOMER_CREATED'),
        payload: customerSnapshot,
      })
      .strict(),
    z
      .object({
        ...customerBase,
        eventType: z.literal('CUSTOMER_UPDATED'),
        payload: z.object({ before: customerSnapshot, after: customerSnapshot }).strict(),
      })
      .strict(),
    z
      .object({
        ...serviceBase,
        eventType: z.literal('SERVICE_CREATED'),
        payload: serviceSnapshot,
      })
      .strict(),
    z
      .object({
        ...serviceBase,
        eventType: z.literal('SERVICE_UPDATED'),
        payload: z.object({ before: serviceSnapshot, after: serviceSnapshot }).strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_DRAFT_CREATED'),
        payload: invoiceDraftSnapshot,
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_DRAFT_UPDATED'),
        payload: z.object({ before: invoiceDraftSnapshot, after: invoiceDraftSnapshot }).strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_DRAFT_DISCARDED'),
        payload: invoiceDraftSnapshot,
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_LINE_ADDED'),
        payload: invoiceLineSnapshot,
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_LINE_UPDATED'),
        payload: z.object({ before: invoiceLineSnapshot, after: invoiceLineSnapshot }).strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_LINE_REMOVED'),
        payload: invoiceLineSnapshot,
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_CONFIRMED'),
        payload: invoiceConfirmedSnapshot,
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('PAYMENT_RECORDED'),
        payload: z
          .object({
            paymentId: z.uuid(),
            amount: z.string(),
            currency: z.enum(['DOP', 'USD']),
            method: z.enum(['CASH', 'TRANSFER', 'CHECK']),
            effectiveDate: z.iso.date(),
            reference: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_CANCELLED'),
        payload: z
          .object({
            reason: z.string(),
            cancelledAt: z.iso.datetime(),
            cancelledByName: z.string(),
            refundId: z.uuid().nullable(),
            refundAmount: z.string(),
            refundMethod: z.enum(['CASH', 'TRANSFER', 'CHECK']).nullable(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_GROSS_PROFIT_RECORDED'),
        payload: z
          .object({
            before: z.string().nullable(),
            after: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_USD_FX_RECORDED'),
        payload: z
          .object({
            asOf: z.string(),
            after: invoiceFxProvenanceSnapshot,
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_USD_FX_RETRIED'),
        payload: z
          .object({
            outcome: z.enum(['RECORDED', 'UNAVAILABLE']),
            reason: z.string().nullable(),
            asOf: z.string(),
            after: invoiceFxProvenanceSnapshot.nullable(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_PDF_GENERATED'),
        payload: z
          .object({
            status: z.literal('READY'),
            errorId: z.null(),
            templateVersion: z.string(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...invoiceBase,
        eventType: z.literal('INVOICE_PDF_FAILED'),
        payload: z
          .object({
            status: z.literal('FAILED'),
            errorId: z.uuid(),
            templateVersion: z.string(),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((event, context) => {
    const expected =
      event.eventType === 'USER_RECOVERY_REQUESTED'
        ? 'ANONYMOUS'
        : event.eventType === 'USER_RECOVERY_EXPIRED' ||
            (event.eventType === 'USER_CREATED' && event.payload.source === 'BOOTSTRAP_CLI')
          ? 'SYSTEM'
          : 'USER';
    if (event.actor.actorType !== expected)
      context.addIssue({ code: 'custom', message: 'Invalid actor for event', path: ['actor'] });
  });
