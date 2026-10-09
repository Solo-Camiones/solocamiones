// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PaymentState } from '../../../src/api/contracts/entities';
import { PaymentChip } from '../../../src/shared/domain';
import '../../support/dom';

const CASES: Array<{ state: PaymentState; label: string; colorClass: string }> = [
  { state: 'PENDING', label: 'Pendiente', colorClass: 'bg-brand/10' },
  { state: 'PARTIALLY_PAID', label: 'Abonado', colorClass: 'bg-violet-50' },
  { state: 'PARTIALLY_PAID_OVERDUE', label: 'Abonada vencida', colorClass: 'bg-orange-50' },
  { state: 'OVERDUE', label: 'Vencida', colorClass: 'bg-red-50' },
  { state: 'PAID', label: 'Pagada', colorClass: 'bg-emerald-50' },
  { state: 'PAID_LATE', label: 'Pagada con retraso', colorClass: 'bg-amber-50' },
  { state: 'CANCELLED', label: 'Cancelada', colorClass: 'bg-navy-50' },
];

describe('PaymentChip', () => {
  it.each(CASES)('uses an identifiable color for $label', ({ state, label, colorClass }) => {
    render(<PaymentChip state={state} />);

    expect(screen.getByText(label)).toHaveClass(colorClass);
  });
});
