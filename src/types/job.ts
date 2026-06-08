export type JobStatus = 'active' | 'completed' | 'paused' | string;
export type JobType = 'fixed_bid' | 'time_and_materials';

export type JobHour = {
  id: string;
  jobId: string;
  date: string;
  workerName: string;
  hours: number;
  hourlyRate: number;
  description: string;
};

export type Receipt = {
  id: string;
  jobId: string;
  date: string;
  vendor: string;
  amount: number;
  description: string;
};

export type Payment = {
  id: string;
  jobId: string;
  date: string;
  amount: number;
  method: string;
  note?: string;
};

export type JobNote = {
  id: string;
  jobId: string;
  date: string;
  text: string;
};

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
  status: JobStatus;
  createdAt?: string;
  updatedAt?: string;
  receipts: Receipt[];
  hours: JobHour[];
  payments: Payment[];
  notes: JobNote[];
};

export type JobFinancialSnapshot = {
  quoteAmount: number;
  totalLaborCost: number;
  totalReceiptCost: number;
  totalCost: number;
  paymentsReceived: number;
  projectedProfit: number;
  projectedMarginPercent: number;
};
