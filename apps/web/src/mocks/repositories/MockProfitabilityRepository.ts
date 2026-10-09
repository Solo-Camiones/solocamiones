import type { ProfitabilityRepository } from '../../api/contracts/repositories';
import type {
  RecordManualGrossProfitInput,
  RetryUsdProfitabilityInput,
  SetFxAvailableInput,
} from '../../api/contracts/profitability';
import { err, ok } from '../../shared/auth/types';
import {
  recordManualGrossProfit,
  retryUsdProfitability,
  setFxAvailable,
} from '../services/profitability-commands';
import { buildProfitabilitySnapshot } from '../services/profitability-catalog';
import { requirePermission } from '../services/require-permission';
import { cloneForRead, getMockState } from '../state';

export class MockProfitabilityRepository implements ProfitabilityRepository {
  async getSnapshot() {
    const permission = requirePermission('profit.view');
    if (!permission.ok) {
      return permission;
    }

    const snapshot = buildProfitabilitySnapshot(getMockState(), permission.value);
    if (!snapshot) {
      return err({ code: 'FORBIDDEN', message: 'No tiene permiso para ver rentabilidad' });
    }

    return ok(cloneForRead(snapshot));
  }

  async setFxAvailable(input: SetFxAvailableInput) {
    const permission = requirePermission('profit.view');
    if (!permission.ok) {
      return permission;
    }

    const result = setFxAvailable(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    const snapshot = buildProfitabilitySnapshot(getMockState(), permission.value);
    if (!snapshot) {
      return err({ code: 'FORBIDDEN', message: 'No tiene permiso para ver rentabilidad' });
    }

    return ok(cloneForRead(snapshot));
  }

  async retryUsd(input: RetryUsdProfitabilityInput) {
    const permission = requirePermission('profit.view');
    if (!permission.ok) {
      return permission;
    }

    const result = retryUsdProfitability(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    const snapshot = buildProfitabilitySnapshot(getMockState(), permission.value);
    if (!snapshot) {
      return err({ code: 'FORBIDDEN', message: 'No tiene permiso para ver rentabilidad' });
    }

    return ok(cloneForRead(snapshot));
  }

  async recordManualGrossProfit(input: RecordManualGrossProfitInput) {
    const permission = requirePermission('profit.view');
    if (!permission.ok) {
      return permission;
    }

    const result = recordManualGrossProfit(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    const snapshot = buildProfitabilitySnapshot(getMockState(), permission.value);
    if (!snapshot) {
      return err({ code: 'FORBIDDEN', message: 'No tiene permiso para ver rentabilidad' });
    }

    return ok(cloneForRead(snapshot));
  }
}

export const mockProfitabilityRepository = new MockProfitabilityRepository();
