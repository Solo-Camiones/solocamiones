import type { Category, Service } from '../contracts/entities';
import type { SaveCategoryInput, SaveServiceInput } from '../contracts/catalogs';
import { err, ok, type Result } from '../../shared/auth/types';
import { httpClient, toAppError } from './http-client';

const SERVICES_PATH = '/api/catalogs/services';
const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

type ApiCatalogService = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CatalogServiceList = { items: ApiCatalogService[] };

async function request<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toAppError(error));
  }
}

function toService(service: ApiCatalogService): Service {
  return {
    id: service.id,
    name: service.name,
    active: service.active,
  };
}

/**
 * Categories stay on the inventory release. Features still call CategoryRepository;
 * HTTP mode hides that tab so this stub is not reached from `/catalogs`.
 */
export async function listCategoriesWithHttp(): Promise<Result<Category[]>> {
  throw new Error('HttpCategoryRepository no implementado — use VITE_USE_MOCK_API=true (WM12)');
}

export async function saveCategoryWithHttp(
  _input: SaveCategoryInput,
): Promise<Result<Category>> {
  throw new Error('HttpCategoryRepository no implementado — use VITE_USE_MOCK_API=true (WM12)');
}

export function listServicesWithHttp(): Promise<Result<Service[]>> {
  return request(async () => {
    const response = await httpClient<CatalogServiceList>(SERVICES_PATH);
    return response.items.map(toService);
  });
}

export function saveServiceWithHttp(input: SaveServiceInput): Promise<Result<Service>> {
  const isUpdate = 'id' in input;
  const body = isUpdate
    ? {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      }
    : { name: input.name, active: input.active };
  return request(async () =>
    toService(
      await httpClient<ApiCatalogService>(
        isUpdate ? `${SERVICES_PATH}/${input.id}` : SERVICES_PATH,
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: CSRF_HEADERS,
          body: JSON.stringify(body),
        },
      ),
    ),
  );
}
