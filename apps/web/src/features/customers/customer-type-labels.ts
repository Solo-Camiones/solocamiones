import type { CustomerType } from '../../api/contracts/entities';

export function customerTypeLabel(type: CustomerType): string {
  return type === 'CREDIT' ? 'Crédito' : 'Contado';
}

export function customerTypeChipTone(type: CustomerType): 'brand' | 'neutral' {
  return type === 'CREDIT' ? 'brand' : 'neutral';
}
