import type { JobFinancialSnapshot } from '@/src/types/job';

export type JobHealth = 'Healthy' | 'Warning' | 'Losing Money' | 'New';

export function getJobHealth(snapshot: JobFinancialSnapshot): JobHealth {
  if (snapshot.projectedProfit < 0) {
    return 'Losing Money';
  }

  if (snapshot.projectedMarginPercent < 15) {
    return 'Warning';
  }

  return 'Healthy';
}

type CurrencyFormatOptions = {
  showCents?: boolean;
};

export function formatCurrency(
  amount: number | string | null | undefined,
  options: CurrencyFormatOptions = {}
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: options.showCents ? 2 : 0,
    minimumFractionDigits: options.showCents ? 2 : 0,
  }).format(numericAmount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
