import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockProfitabilityRepository } from '../../../../src/mocks/repositories/MockProfitabilityRepository';
import { resetMockState } from '../../../../src/mocks/state';
import { signInAs } from '../../../support/session';

describe('MockProfitabilityRepository', () => {
  beforeEach(() => {
    resetMockState();
    signInAs('ADMINISTRATOR');
  });

  afterEach(resetMockState);

  it('returns refreshed snapshots after FX retry and manual profit commands', async () => {
    const repository = new MockProfitabilityRepository();

    await expect(repository.getSnapshot()).resolves.toMatchObject({
      ok: true,
      value: { fxAvailable: false },
    });
    await expect(repository.setFxAvailable({ available: true })).resolves.toMatchObject({
      ok: true,
      value: { fxAvailable: true },
    });
    await expect(repository.retryUsd({ invoiceId: 'INV-096' })).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repository.recordManualGrossProfit({ invoiceId: 'INV-097', profitDop: 250 }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('propagates permission and command failures', async () => {
    const repository = new MockProfitabilityRepository();

    await expect(repository.retryUsd({ invoiceId: 'missing' })).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      repository.recordManualGrossProfit({ invoiceId: 'missing', profitDop: 250 }),
    ).resolves.toMatchObject({ ok: false });

    signInAs('SELLER');
    await expect(repository.getSnapshot()).resolves.toMatchObject({ ok: false });
    await expect(repository.setFxAvailable({ available: true })).resolves.toMatchObject({
      ok: false,
    });
    await expect(repository.retryUsd({ invoiceId: 'INV-096' })).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      repository.recordManualGrossProfit({ invoiceId: 'INV-097', profitDop: 250 }),
    ).resolves.toMatchObject({ ok: false });
  });
});
