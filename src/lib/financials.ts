import type { Job, JobFinancialSnapshot } from '@/src/types/job';

export type JobHealth = 'Healthy' | 'Warning' | 'Losing Money' | 'New';

export function calculateJobFinancialSnapshot(job: Job): JobFinancialSnapshot {
  const totalLaborCost = job.hours.reduce(
    (sum, entry) => sum + entry.hours * entry.hourlyRate,
    0
  );
  const totalReceiptCost = job.receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const paymentsReceived = job.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalCost = totalLaborCost + totalReceiptCost;
  const projectedProfit = job.quoteAmount - totalCost;
  const projectedMarginPercent =
    job.quoteAmount > 0 ? (projectedProfit / job.quoteAmount) * 100 : 0;

  return {
    quoteAmount: job.quoteAmount,
    totalLaborCost,
    totalReceiptCost,
    totalCost,
    paymentsReceived,
    projectedProfit,
    projectedMarginPercent,
  };
}

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
