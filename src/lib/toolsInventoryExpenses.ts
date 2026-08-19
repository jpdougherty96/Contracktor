import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type ToolsInventoryExpense = Tables<'tools_inventory_expenses'>;

export async function fetchToolsInventoryExpenses(): Promise<ToolsInventoryExpense[]> {
  const { data, error } = await supabase
    .from('tools_inventory_expenses')
    .select(
      'id, owner_id, business_id, receipt_id, receipt_line_item_id, description, expense_date, expense_type, source_type, pre_tax_amount, tax_amount, total_amount, billable, status, notes, created_at, updated_at, receipt_vendor, receipt_date, receipt_storage_path'
    )
    .order('expense_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
