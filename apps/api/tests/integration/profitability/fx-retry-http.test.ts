import { randomUUID } from 'node:crypto';

import { Prisma, type Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import {
  FX_RETRY_COMPLETED_USD_ONLY_MESSAGE,
  FX_RETRY_NOT_PENDING_MESSAGE,
  FX_RETRY_RATE_UNAVAILABLE_MESSAGE,
  PENDING_FX_MANUAL_PROFIT_MESSAGE,
} from '../../../src/features/profitability/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { EXCHANGE_RATE_API_SOURCE } from '../../../src/infrastructure/fx/index.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { successfulUsdDopRate } from '../../helpers/fx.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const SALES = '/api/sales';
const PROFIT = '/api/profitability';

async function fixture(agent: request.Agent, role: Role = 'ADMINISTRATOR') {
  const user = await users.create({
    name: 'Fixture',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

async function cleanup() {
  vi.restoreAllMocks();
  await resetLoginRateLimit();
  await clearTestHistory();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.update({
    where: { name: 'FAC' },
    data: { nextValue: 1 },
  });
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(disconnectPrisma);

async function confirmUsdGeneric(
  agent: request.Agent,
  cost: { costProvenance: 'ACTUAL' | 'UNKNOWN'; acquisitionCostDop?: string },
) {
  const draft = await agent.post(SALES).set(CSRF).send({ currency: 'USD' });
  expect(draft.status).toBe(201);
  expect(
    (
      await agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
        type: 'GENERIC',
        description: 'Filtro',
        unitPrice: '118.00',
        ...cost,
      })
    ).status,
  ).toBe(201);
  await assignNamedCustomerForCredit(agent, draft.body.id);
  const confirmed = await agent.post(`${SALES}/${draft.body.id}/confirm`).set(CSRF).send({});
  expect(confirmed.status).toBe(200);
  return confirmed.body;
}

describe('M16 Retry FX Administrator', () => {
  afterEach(cleanup);

  it('records the historical rate without mutating the sale and omits retry from Seller', async () => {
    const getUsdToDopRate = vi.fn(async (query?: { asOf?: Date }) => {
      if (query?.asOf == null) return { ok: false as const, reason: 'timeout' };
      return successfulUsdDopRate('61.50');
    });
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmUsdGeneric(admin.agent, {
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '80.00',
    });
    expect(invoice.profitability.reason).toBe('PENDING_FX_RATE');
    const number = invoice.number;
    const confirmedAt = invoice.confirmedAt;

    const retried = await admin.agent.post(`${PROFIT}/${invoice.id}/retry`).set(CSRF).send({});
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({
      status: 'COMPLETED',
      number,
      confirmedAt,
      profitability: {
        status: 'CALCULATED',
        reason: null,
        profitDop: '7177.00',
      },
    });
    expect(retried.body.profitability.fx.source).toBe(EXCHANGE_RATE_API_SOURCE);
    expect(
      new Prisma.Decimal(retried.body.profitability.fx.exchangeRateDopPerUsd).equals(
        new Prisma.Decimal('61.5'),
      ),
    ).toBe(true);
    expect(retried.body.lines).toHaveLength(invoice.lines.length);
    expect(getUsdToDopRate).toHaveBeenCalledWith({ asOf: new Date(confirmedAt) });

    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ status: 'COMPLETED', number });
    expect(stored?.exchangeRateDopPerUsd?.equals(new Prisma.Decimal('61.5'))).toBe(true);

    expect(
      await prisma.historyEvent.findMany({
        where: { subjectId: invoice.id, eventType: 'INVOICE_USD_FX_RETRIED' },
      }),
    ).toEqual([
      expect.objectContaining({
        actorUserId: admin.user.id,
        payload: expect.objectContaining({
          outcome: 'RECORDED',
          reason: null,
          asOf: confirmedAt,
        }),
      }),
    ]);

    const seller = await fixture(request.agent(app), 'SELLER');
    expect((await seller.agent.post(`${PROFIT}/${invoice.id}/retry`).set(CSRF).send({})).status).toBe(
      403,
    );

    const second = await admin.agent.post(`${PROFIT}/${invoice.id}/retry`).set(CSRF).send({});
    expect(second.status).toBe(409);
    expect(second.body.error.message).toBe(FX_RETRY_NOT_PENDING_MESSAGE);
    expect(getUsdToDopRate).toHaveBeenCalledTimes(2);
  });

  it('keeps the sale intact and writes history when historical FX is unavailable', async () => {
    const getUsdToDopRate = vi.fn(async (query?: { asOf?: Date }) => {
      if (query?.asOf == null) return { ok: false as const, reason: 'timeout' };
      return { ok: false as const, reason: 'plan-upgrade-required' };
    });
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app));
    const invoice = await confirmUsdGeneric(admin.agent, {
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '80.00',
    });

    const retried = await admin.agent.post(`${PROFIT}/${invoice.id}/retry`).set(CSRF).send({});
    expect(retried.status).toBe(409);
    expect(retried.body.error.message).toBe(FX_RETRY_RATE_UNAVAILABLE_MESSAGE);

    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored).toMatchObject({
      status: 'COMPLETED',
      number: invoice.number,
      exchangeRateDopPerUsd: null,
    });
    expect(
      await prisma.historyEvent.findMany({
        where: { subjectId: invoice.id, eventType: 'INVOICE_USD_FX_RETRIED' },
      }),
    ).toEqual([
      expect.objectContaining({
        payload: {
          outcome: 'UNAVAILABLE',
          reason: 'plan-upgrade-required',
          asOf: invoice.confirmedAt,
          after: null,
        },
      }),
    ]);

    const manual = await admin.agent
      .post(`${PROFIT}/${invoice.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '100.00' });
    expect(manual.status).toBe(409);
    expect(manual.body.error.message).toBe(PENDING_FX_MANUAL_PROFIT_MESSAGE);
  });

  it('rejects DOP invoices, drafts, and Mechanic', async () => {
    const getUsdToDopRate = vi.fn(async () => successfulUsdDopRate('61.50'));
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app));
    const mechanic = await fixture(request.agent(app), 'MECHANIC');

    const dopDraft = await admin.agent.post(SALES).set(CSRF).send({});
    await admin.agent.post(`${SALES}/${dopDraft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '18000.00',
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '12300.00',
    });
    await assignNamedCustomerForCredit(admin.agent, dopDraft.body.id);
    const dop = await admin.agent.post(`${SALES}/${dopDraft.body.id}/confirm`).set(CSRF).send({});
    const dopRetry = await admin.agent.post(`${PROFIT}/${dop.body.id}/retry`).set(CSRF).send({});
    expect(dopRetry.status).toBe(409);
    expect(dopRetry.body.error.message).toBe(FX_RETRY_COMPLETED_USD_ONLY_MESSAGE);
    expect(getUsdToDopRate).not.toHaveBeenCalledWith(expect.objectContaining({ asOf: expect.any(Date) }));

    const draft = await admin.agent.post(SALES).set(CSRF).send({ currency: 'USD' });
    const draftRetry = await admin.agent.post(`${PROFIT}/${draft.body.id}/retry`).set(CSRF).send({});
    expect(draftRetry.status).toBe(409);
    expect(draftRetry.body.error.message).toBe(FX_RETRY_COMPLETED_USD_ONLY_MESSAGE);

    expect((await mechanic.agent.post(`${PROFIT}/${dop.body.id}/retry`).set(CSRF).send({})).status).toBe(
      403,
    );
  });
});
