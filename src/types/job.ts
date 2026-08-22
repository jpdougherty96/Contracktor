export type JobStatus = 'active' | 'completed' | 'paused' | string;
export type JobType = 'fixed_bid' | 'time_and_materials';

export type Job = {
  id: string;
  name: string;
  clientName: string;
  location?: string | null;
  jobType: JobType;
  quoteAmount: number;
  hourlyRate?: number | null;
  timeClockEnabled: boolean;
  estimatedLaborHours?: number | null;
  estimatedMaterialCost?: number | null;
  estimatedSubCost?: number | null;
  estimatedMiscCost?: number | null;
  actualMaterialCost?: number | null;
  actualLaborHours?: number | null;
  paymentsReceived?: number | null;
  financialSnapshot?: JobFinancialSnapshot | null;
  status: JobStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type JobFinancialSnapshot = {
  quoteAmount: number;
  totalLaborCost: number;
  totalReceiptCost: number;
  totalCost: number;
  totalHours: number;
  paymentsReceived: number;
  projectedProfit: number;
  projectedMarginPercent: number;
};
