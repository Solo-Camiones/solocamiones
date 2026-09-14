import { randomUUID } from 'node:crypto';

import { Prisma, type Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import { HistoryRepository } from '../../../src/features/history/repository.js';
import { EXCHANGE_RATE_API_SOURCE } from '../../../src/infrastructure/fx/index.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { successfulUsdDopRate, staticFxRateProvider } from '../../helpers/fx.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/sales';

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

describe('M15 FX adapter + pending (COST-003 USD)', () => {
  afterEach(cleanup);

  it('calculates USD profit when the adapter returns conversion_rate and omits rates from Seller', async () => {
    const getUsdToDopRate = vi.fn(async () => successfulUsdDopRate('61.50'));
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app));
    const identified = await prisma.customer.create({
      data: { name: 'Taller Norte', rnc: '131123456' },
    });
    const draft = await admin.agent
      .post(ROOT)
      .set(CSRF)
      .send({ currency: 'USD', customerId: identified.id, fiscal: false });
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '118.00',
          costProvenance: 'ACTUAL',
          acquisitionCostDop: '80.00',
        })
      ).status,
    ).toBe(201);

    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.number).toMatch(/^FAC-\d{6}$/);
    expect(confirmed.body.profitability).toMatchObject({
      status: 'CALCULATED',
      reason: null,
      profitDop: '7177.00',
    });
    expect(
      new Prisma.Decimal(confirmed.body.profitability.fx.exchangeRateDopPerUsd).equals(
        new Prisma.Decimal('61.5'),
      ),
    ).toBe(true);
    expect(confirmed.body.profitability.fx.source).toBe(EXCHANGE_RATE_API_SOURCE);
    expect(getUsdToDopRate).toHaveBeenCalledTimes(1);

    const stored = await prisma.invoice.findUnique({ where: { id: draft.body.id } });
    expect(stored?.exchangeRateDopPerUsd?.equals(new Prisma.Decimal('61.5'))).toBe(true);
    expect(JSON.stringify(confirmed.body)).not.toMatch(/EXCHANGE_RATE_API_KEY|test-key/i);

    expect(
      await prisma.historyEvent.findMany({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_USD_FX_RECORDED' },
      }),
    ).toEqual([
      expect.objectContaining({
        actorUserId: admin.user.id,
        payload: {
          asOf: confirmed.body.confirmedAt,
          after: {
            exchangeRateDopPerUsd: '61.5',
            source: EXCHANGE_RATE_API_SOURCE,
            rateUpdatedAt: '2026-09-08T00:00:00.000Z',
            obtainedAt: '2026-09-08T12:00:00.000Z',
          },
        },
      }),
    ]);

    const adminView = await admin.agent.get(`${ROOT}/${draft.body.id}`);
    expect(adminView.status).toBe(200);
    expect(
      adminView.body.history.find(
        (event: { type: string }) => event.type === 'INVOICE_USD_FX_RECORDED',
      ),
    ).toMatchObject({
      type: 'INVOICE_USD_FX_RECORDED',
      description: 'Tasa USD 61.5 DOP/USD registrada (proveedor de tipo de cambio)',
      actorName: admin.user.name,
    });

    const seller = await fixture(request.agent(app), 'SELLER');
    const sellerView = await seller.agent.get(`${ROOT}/${draft.body.id}`);
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.profitability).toBeUndefined();
    expect(sellerView.body.lines[0].profitability).toBeUndefined();
    expect(sellerView.body.fx).toBeUndefined();
    expect(JSON.stringify(sellerView.body)).not.toContain('61.5');
    expect(
      sellerView.body.history.some(
        (event: { type: string }) => event.type === 'INVOICE_USD_FX_RECORDED',
      ),
    ).toBe(false);
  });

  it('confirms the USD sale when FX times out or returns quota-reached', async () => {
    for (const reason of ['timeout', 'quota-reached'] as const) {
      await cleanup();
      const app = createTestApp({
        fxRateProvider: staticFxRateProvider({ ok: false, reason }),
      });
      const admin = await fixture(request.agent(app));
      const draft = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'USD' });
      expect(
        (
          await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
            type: 'GENERIC',
            description: 'Filtro',
            unitPrice: '118.00',
            costProvenance: 'ACTUAL',
            acquisitionCostDop: '80.00',
          })
        ).status,
      ).toBe(201);
      await assignNamedCustomerForCredit(admin.agent, draft.body.id);
      const confirmed = await admin.agent
        .post(`${ROOT}/${draft.body.id}/confirm`)
        .set(CSRF)
        .send({});
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.number).toMatch(/^FAC-\d{6}$/);
      expect(confirmed.body.status).toBe('COMPLETED');
      expect(confirmed.body.profitability).toEqual({
        status: 'UNAVAILABLE',
        reason: 'PENDING_FX_RATE',
        profitDop: null,
        margin: null,
      });
      expect(await prisma.invoice.findUnique({ where: { id: draft.body.id } })).toMatchObject({
        status: 'COMPLETED',
        exchangeRateDopPerUsd: null,
      });
    }
  });

  it('keeps the confirmed sale pending and rolls back the rate when initial FX history fails', async () => {
    const originalAppend = HistoryRepository.prototype.append;
    vi.spyOn(HistoryRepository.prototype, 'append').mockImplementation(function (
      this: HistoryRepository,
      input,
    ) {
      if (input.eventType === 'INVOICE_USD_FX_RECORDED') {
        throw new Error('simulated initial FX history failure');
      }
      return originalAppend.call(this, input);
    });
    const app = createTestApp({
      fxRateProvider: staticFxRateProvider(successfulUsdDopRate('61.50')),
    });
    const admin = await fixture(request.agent(app));
    const draft = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'USD' });
    await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: 'ACTUAL',
      acquisitionCostDop: '80.00',
    });
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);

    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({
      status: 'COMPLETED',
      profitability: {
        status: 'UNAVAILABLE',
        reason: 'PENDING_FX_RATE',
        profitDop: null,
        margin: null,
      },
    });
    expect(await prisma.invoice.findUnique({ where: { id: draft.body.id } })).toMatchObject({
      status: 'COMPLETED',
      exchangeRateDopPerUsd: null,
    });
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: draft.body.id, eventType: 'INVOICE_USD_FX_RECORDED' },
      }),
    ).toBe(0);
  });

  it('does not call FX for a DOP confirmation', async () => {
    const getUsdToDopRate = vi.fn(async () => successfulUsdDopRate('61.50'));
    const app = createTestApp({ fxRateProvider: { getUsdToDopRate } });
    const admin = await fixture(request.agent(app));
    const draft = await admin.agent.post(ROOT).set(CSRF).send({});
    expect(
      (
        await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '18000.00',
          costProvenance: 'ACTUAL',
          acquisitionCostDop: '12300.00',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    const confirmed = await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.profitability.profitDop).toBe('5700.00');
    expect(confirmed.body.profitability.fx).toBeUndefined();
    expect(getUsdToDopRate).not.toHaveBeenCalled();
  });

  it('calculates a manual USD profit margin using DOP selling price', async () => {
    const app = createTestApp({
      fxRateProvider: staticFxRateProvider(successfulUsdDopRate('60.00')),
    });
    const admin = await fixture(request.agent(app));
    const draft = await admin.agent.post(ROOT).set(CSRF).send({ currency: 'USD' });
    await admin.agent.post(`${ROOT}/${draft.body.id}/lines`).set(CSRF).send({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '100.00',
      costProvenance: 'UNKNOWN',
    });
    await assignNamedCustomerForCredit(admin.agent, draft.body.id);
    await admin.agent.post(`${ROOT}/${draft.body.id}/confirm`).set(CSRF).send({});

    const recorded = await admin.agent
      .post(`/api/profitability/${draft.body.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '3000.00' });

    expect(recorded.status).toBe(200);
    expect(recorded.body.profitability).toMatchObject({
      status: 'MANUAL',
      profitDop: '3000.00',
      margin: '50.00',
    });
  });
});
