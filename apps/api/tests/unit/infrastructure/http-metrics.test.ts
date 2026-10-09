import { describe, expect, it } from 'vitest';

import { classifyHttpRouteGroup } from '../../../src/infrastructure/metrics/http-metrics.js';

describe('classifyHttpRouteGroup', () => {
  it('maps known API prefixes to stable buckets', () => {
    expect(classifyHttpRouteGroup('/metrics')).toBe('metrics');
    expect(classifyHttpRouteGroup('/api/health/ready')).toBe('health');
    expect(classifyHttpRouteGroup('/api/auth/login')).toBe('auth');
    expect(classifyHttpRouteGroup('/api/admin/users')).toBe('admin');
    expect(classifyHttpRouteGroup('/api/customers/1')).toBe('customers');
    expect(classifyHttpRouteGroup('/api/catalogs/services')).toBe('catalogs');
    expect(classifyHttpRouteGroup('/api/sales/invoices')).toBe('sales');
    expect(classifyHttpRouteGroup('/api/profitability/x')).toBe('profitability');
    expect(classifyHttpRouteGroup('/api/assistant/chat')).toBe('assistant');
    expect(classifyHttpRouteGroup('/api/unknown')).toBe('api_other');
    expect(classifyHttpRouteGroup('/favicon.ico')).toBe('other');
  });
});
