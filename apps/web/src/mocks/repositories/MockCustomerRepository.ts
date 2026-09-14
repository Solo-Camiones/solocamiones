import type { SaveCustomerInput } from '../../api/contracts/customers';
import type { CustomerRepository } from '../../api/contracts/repositories';
import { toListPage } from '../../api/contracts/pagination';
import { err, ok } from '../../shared/auth/types';
import { buildCustomerDirectory, prepareCustomerSave } from '../services/customers';
import { requirePermission } from '../services/require-permission';
import { cloneForRead, getMockState } from '../state';

export class MockCustomerRepository implements CustomerRepository {
  async list() {
    const permission = requirePermission('customers.manage');
    if (!permission.ok) {
      return permission;
    }

    return ok(cloneForRead(buildCustomerDirectory(getMockState(), '')));
  }

  async search(query: string, page = 1) {
    const permission = requirePermission('customers.manage');
    if (!permission.ok) {
      return permission;
    }

    return ok(toListPage(cloneForRead(buildCustomerDirectory(getMockState(), query)), page));
  }

  async getById(id: string) {
    const permission = requirePermission('customers.manage');
    if (!permission.ok) {
      return permission;
    }

    const customer = getMockState().customers.find((entry) => entry.id === id);
    if (!customer) {
      return err({ code: 'NOT_FOUND', message: 'Cliente no encontrado' });
    }
    return ok(cloneForRead(customer));
  }

  async save(input: SaveCustomerInput) {
    const permission = requirePermission('customers.manage');
    if (!permission.ok) {
      return permission;
    }

    const state = getMockState();
    const prepared = prepareCustomerSave(state.customers, input);
    if (!prepared.ok) {
      return prepared;
    }

    const customer = prepared.value;
    const index = state.customers.findIndex((entry) => entry.id === customer.id);

    if (index >= 0) {
      state.customers[index] = customer;
    } else {
      state.customers.push(customer);
    }

    return ok(cloneForRead(customer));
  }
}

export const mockCustomerRepository = new MockCustomerRepository();
