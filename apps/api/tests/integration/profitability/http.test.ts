import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../src/features/access/password.js';
import { resetLoginRateLimit } from '../../../src/features/access/login-rate-limit.js';
import {
  CALCULATED_PROFIT_EXISTS_MESSAGE,
  COMPLETED_ONLY_MANUAL_PROFIT_MESSAGE,
  PENDING_FX_MANUAL_PROFIT_MESSAGE,
} from '../../../src/features/profitability/constants.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { createTestApp } from '../../helpers/app.js';
import { clearTestHistory } from '../../helpers/history.js';
import { assignNamedCustomerForCredit } from '../../helpers/sales.js';

const app = createTestApp();
const users = new UserRepository();
const PASSWORD = 'personal-password';
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const SALES = '/api/sales';
const PROFIT = '/api/profitability';

async function fixture(role: Role = 'ADMINISTRATOR') {
  const user = await users.create({
    name: 'Fixture',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  const agent = request.agent(app);
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent };
}

async function cleanup() {
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

describe('M14 COST-005 judged gross profit', () => {
  afterEach(cleanup);

  async function confirmUnknownDop(agent: Awaited<ReturnType<typeof fixture>>['agent']) {
    const draft = await agent.post(SALES).set(CSRF).send({});
    expect(draft.status).toBe(201);
    expect(
      (
        await agent.post(`${SALES}/${draft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Sin costo',
          unitPrice: '100.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(agent, draft.body.id);
    const confirmed = await agent.post(`${SALES}/${draft.body.id}/confirm`).set(CSRF).send({});
    expect(confirmed.status).toBe(200);
    return confirmed.body;
  }

  it('lets Administrator record DOP profit when cost is unknown and keeps cost unchanged', async () => {
    const admin = await fixture();
    const invoice = await confirmUnknownDop(admin.agent);
    expect(invoice.profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });

    const recorded = await admin.agent
      .post(`${PROFIT}/${invoice.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '20.00' });
    expect(recorded.status).toBe(200);
    expect(recorded.body.profitability).toEqual({
      status: 'MANUAL',
      reason: null,
      profitDop: '20.00',
      margin: '20.00',
    });
    expect(recorded.body.lines[0].profitability).toEqual({
      status: 'UNAVAILABLE',
      reason: 'UNKNOWN_COST',
      profitDop: null,
      margin: null,
    });
    expect(recorded.body.lines[0].acquisitionCostDop).toBeNull();
    expect(recorded.body.lines[0].costProvenance).toBe('UNKNOWN');
    expect(recorded.body.status).toBe('COMPLETED');
    expect(recorded.body.number).toBe(invoice.number);

    const listed = await admin.agent.get(`${SALES}?status=COMPLETED`);
    expect(listed.body.items[0].profitability).toEqual(recorded.body.profitability);

    expect(
      await prisma.historyEvent.findMany({
        where: { subjectId: invoice.id, eventType: 'INVOICE_GROSS_PROFIT_RECORDED' },
      }),
    ).toEqual([
      expect.objectContaining({
        actorUserId: admin.user.id,
        payload: { before: null, after: '20.00' },
      }),
    ]);

    const zero = await admin.agent
      .post(`${PROFIT}/${invoice.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '0.00' });
    expect(zero.status).toBe(200);
    expect(zero.body.profitability.profitDop).toBe('0.00');
    const loss = await admin.agent
      .post(`${PROFIT}/${invoice.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '-10.00' });
    expect(loss.status).toBe(200);
    expect(loss.body.profitability.profitDop).toBe('-10.00');
    expect(
      await prisma.historyEvent.count({
        where: { subjectId: invoice.id, eventType: 'INVOICE_GROSS_PROFIT_RECORDED' },
      }),
    ).toBe(3);

    const seller = await fixture('SELLER');
    const sellerView = await seller.agent.get(`${SALES}/${invoice.id}`);
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.profitability).toBeUndefined();
    expect(sellerView.body.lines[0].costProvenance).toBe('UNKNOWN');
  });

  it('rejects estimated profit, pending FX, drafts, Seller, and Mechanic', async () => {
    const admin = await fixture();
    const seller = await fixture('SELLER');
    const mechanic = await fixture('MECHANIC');

    const estimatedDraft = await admin.agent.post(SALES).set(CSRF).send({});
    expect(
      (
        await admin.agent.post(`${SALES}/${estimatedDraft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '18000.00',
          costProvenance: 'ESTIMATED',
          acquisitionCostDop: '12300.00',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, estimatedDraft.body.id);
    const estimated = await admin.agent
      .post(`${SALES}/${estimatedDraft.body.id}/confirm`)
      .set(CSRF)
      .send({});
    expect(estimated.status).toBe(200);
    const estimatedDenied = await admin.agent
      .post(`${PROFIT}/${estimated.body.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '100.00' });
    expect(estimatedDenied.status).toBe(409);
    expect(estimatedDenied.body.error.message).toBe(CALCULATED_PROFIT_EXISTS_MESSAGE);

    const usdDraft = await admin.agent.post(SALES).set(CSRF).send({ currency: 'USD' });
    expect(
      (
        await admin.agent.post(`${SALES}/${usdDraft.body.id}/lines`).set(CSRF).send({
          type: 'GENERIC',
          description: 'Filtro',
          unitPrice: '118.00',
          costProvenance: 'UNKNOWN',
        })
      ).status,
    ).toBe(201);
    await assignNamedCustomerForCredit(admin.agent, usdDraft.body.id);
    const usd = await admin.agent.post(`${SALES}/${usdDraft.body.id}/confirm`).set(CSRF).send({});
    const usdDenied = await admin.agent
      .post(`${PROFIT}/${usd.body.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '100.00' });
    expect(usdDenied.status).toBe(409);
    expect(usdDenied.body.error.message).toBe(PENDING_FX_MANUAL_PROFIT_MESSAGE);

    const draft = await admin.agent.post(SALES).set(CSRF).send({});
    const draftDenied = await admin.agent
      .post(`${PROFIT}/${draft.body.id}/manual-gross-profit`)
      .set(CSRF)
      .send({ profitDop: '100.00' });
    expect(draftDenied.status).toBe(409);
    expect(draftDenied.body.error.message).toBe(COMPLETED_ONLY_MANUAL_PROFIT_MESSAGE);

    const unknown = await confirmUnknownDop(admin.agent);
    expect(
      (
        await seller.agent
          .post(`${PROFIT}/${unknown.id}/manual-gross-profit`)
          .set(CSRF)
          .send({ profitDop: '20.00' })
      ).status,
    ).toBe(403);
    expect(
      (
        await mechanic.agent
          .post(`${PROFIT}/${unknown.id}/manual-gross-profit`)
          .set(CSRF)
          .send({ profitDop: '20.00' })
      ).status,
    ).toBe(403);
  });
});
