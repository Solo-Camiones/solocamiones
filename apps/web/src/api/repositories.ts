/**
 * Composition root: features import repositories from here, never from mocks/.
 *
 * Vite inlines `import.meta.env.VITE_USE_MOCK_API`. Mock only when the value is `true`.
 * Unset, empty, or `false` selects HTTP repositories.
 */
import { useMockApi } from './client/http-client';
import type { AuthRepository } from './contracts/repositories';
import {
  httpAuthRepository,
  httpCategoryRepository,
  httpCustomerRepository,
  httpDashboardRepository,
  httpInventoryRepository,
  httpProfitabilityRepository,
  httpRecoveryRepository,
  httpSalesRepository,
  httpServiceRepository,
  httpUserRepository,
  httpWorkOrderRepository,
} from './http/repositories';
import { httpAssistantRepository } from './http/assistant-repository';
import {
  mockAuthRepository,
  mockCategoryRepository,
  mockCustomerRepository,
  mockDashboardRepository,
  mockInventoryRepository,
  mockProfitabilityRepository,
  mockRecoveryRepository,
  mockSalesRepository,
  mockServiceRepository,
  mockUserRepository,
  mockWorkOrderRepository,
} from '../mocks/repositories';

export const authRepository: AuthRepository = useMockApi ? mockAuthRepository : httpAuthRepository;
export const userRepository = useMockApi ? mockUserRepository : httpUserRepository;
export const inventoryRepository = useMockApi ? mockInventoryRepository : httpInventoryRepository;
export const customerRepository = useMockApi ? mockCustomerRepository : httpCustomerRepository;
export const salesRepository = useMockApi ? mockSalesRepository : httpSalesRepository;
export const workOrderRepository = useMockApi ? mockWorkOrderRepository : httpWorkOrderRepository;
export const categoryRepository = useMockApi ? mockCategoryRepository : httpCategoryRepository;
export const serviceRepository = useMockApi ? mockServiceRepository : httpServiceRepository;
export const dashboardRepository = useMockApi ? mockDashboardRepository : httpDashboardRepository;
export const profitabilityRepository = useMockApi
  ? mockProfitabilityRepository
  : httpProfitabilityRepository;
export const recoveryRepository = useMockApi ? mockRecoveryRepository : httpRecoveryRepository;

/**
 * Assistant is HTTP-only (M7). Mock mode keeps the capability off and does not
 * ship a fake chatbot repository.
 */
export const assistantRepository = useMockApi ? undefined : httpAssistantRepository;
