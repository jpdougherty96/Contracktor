export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string | null
          description: string | null
          file_type: string | null
          id: string
          job_id: string | null
          note_id: string | null
          original_filename: string | null
          owner_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          id?: string
          job_id?: string | null
          note_id?: string | null
          original_filename?: string | null
          owner_id: string
          storage_path: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          id?: string
          job_id?: string | null
          note_id?: string | null
          original_filename?: string | null
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "job_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_name: string | null
          contact_type: string
          created_at: string | null
          display_name: string
          email: string | null
          id: string
          notes: string | null
          owner_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          display_name: string
          email?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          job_id: string | null
          method: string | null
          note: string | null
          owner_id: string
          payment_date: string
          source: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          job_id?: string | null
          method?: string | null
          note?: string | null
          owner_id: string
          payment_date: string
          source?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          job_id?: string | null
          method?: string | null
          note?: string | null
          owner_id?: string
          payment_date?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "customer_payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          billable: boolean
          created_at: string | null
          description: string
          expense_date: string
          expense_type: string
          id: string
          job_id: string | null
          notes: string | null
          owner_id: string
          pre_tax_amount: number
          receipt_id: string | null
          receipt_line_item_id: string | null
          source_type: string
          status: string
          tax_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          billable?: boolean
          created_at?: string | null
          description: string
          expense_date?: string
          expense_type?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          owner_id: string
          pre_tax_amount?: number
          receipt_id?: string | null
          receipt_line_item_id?: string | null
          source_type?: string
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          billable?: boolean
          created_at?: string | null
          description?: string
          expense_date?: string
          expense_type?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          owner_id?: string
          pre_tax_amount?: number
          receipt_id?: string | null
          receipt_line_item_id?: string | null
          source_type?: string
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_receipt_line_item_id_fkey"
            columns: ["receipt_line_item_id"]
            isOneToOne: false
            referencedRelation: "receipt_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_activity: {
        Row: {
          activity_type: string
          created_at: string | null
          detail: string | null
          id: string
          job_id: string | null
          occurred_at: string
          owner_id: string
          source_id: string | null
          source_table: string | null
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          detail?: string | null
          id?: string
          job_id?: string | null
          occurred_at?: string
          owner_id: string
          source_id?: string | null
          source_table?: string | null
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          detail?: string | null
          id?: string
          job_id?: string | null
          occurred_at?: string
          owner_id?: string
          source_id?: string | null
          source_table?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_activity_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_activity_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_crew_members: {
        Row: {
          active: boolean
          created_at: string | null
          hourly_rate: number
          id: string
          job_id: string
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          hourly_rate?: number
          id?: string
          job_id: string
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          hourly_rate?: number
          id?: string
          job_id?: string
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_crew_members_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_crew_members_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_crew_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          is_primary: boolean
          job_id: string
          owner_id: string
          role: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          job_id: string
          owner_id: string
          role?: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          job_id?: string
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          created_at: string | null
          id: string
          job_id: string | null
          note: string
          note_type: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          note: string
          note_type?: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          note?: string
          note_type?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_plans: {
        Row: {
          assumptions: string | null
          created_at: string | null
          estimated_labor_hours: number | null
          estimated_material_cost: number | null
          estimated_other_cost: number | null
          exclusions: string | null
          id: string
          job_id: string
          owner_id: string
          planned_phases: string | null
          scope_of_work: string | null
          updated_at: string | null
        }
        Insert: {
          assumptions?: string | null
          created_at?: string | null
          estimated_labor_hours?: number | null
          estimated_material_cost?: number | null
          estimated_other_cost?: number | null
          exclusions?: string | null
          id?: string
          job_id: string
          owner_id: string
          planned_phases?: string | null
          scope_of_work?: string | null
          updated_at?: string | null
        }
        Update: {
          assumptions?: string | null
          created_at?: string | null
          estimated_labor_hours?: number | null
          estimated_material_cost?: number | null
          estimated_other_cost?: number | null
          exclusions?: string | null
          id?: string
          job_id?: string
          owner_id?: string
          planned_phases?: string | null
          scope_of_work?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_snapshots: {
        Row: {
          created_at: string | null
          financial_summary: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          job_id: string
          next_actions: string | null
          open_questions: string | null
          owner_id: string
          risk_summary: string | null
          scope_summary: string | null
          snapshot_json: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          financial_summary?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          job_id: string
          next_actions?: string | null
          open_questions?: string | null
          owner_id: string
          risk_summary?: string | null
          scope_summary?: string | null
          snapshot_json?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          financial_summary?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          job_id?: string
          next_actions?: string | null
          open_questions?: string | null
          owner_id?: string
          risk_summary?: string | null
          scope_summary?: string | null
          snapshot_json?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snapshots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          client_name: string | null
          created_at: string | null
          end_date: string | null
          estimated_labor_hours: number | null
          estimated_material_cost: number | null
          estimated_misc_cost: number | null
          estimated_sub_cost: number | null
          hourly_rate: number | null
          id: string
          job_type: string
          location: string | null
          name: string
          owner_id: string
          quote_amount: number
          start_date: string | null
          status: string
          time_clock_enabled: boolean
          updated_at: string | null
        }
        Insert: {
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          estimated_labor_hours?: number | null
          estimated_material_cost?: number | null
          estimated_misc_cost?: number | null
          estimated_sub_cost?: number | null
          hourly_rate?: number | null
          id?: string
          job_type?: string
          location?: string | null
          name: string
          owner_id: string
          quote_amount?: number
          start_date?: string | null
          status?: string
          time_clock_enabled?: boolean
          updated_at?: string | null
        }
        Update: {
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          estimated_labor_hours?: number | null
          estimated_material_cost?: number | null
          estimated_misc_cost?: number | null
          estimated_sub_cost?: number | null
          hourly_rate?: number | null
          id?: string
          job_type?: string
          location?: string | null
          name?: string
          owner_id?: string
          quote_amount?: number
          start_date?: string | null
          status?: string
          time_clock_enabled?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          default_hourly_rate: number | null
          full_name: string | null
          id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          full_name?: string | null
          id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      receipt_line_items: {
        Row: {
          assigned_job_id: string | null
          assignment_type: string
          category: string | null
          cleaned_name: string
          confidence: number | null
          created_at: string | null
          id: string
          line_number: number
          line_total: number
          line_type: string
          original_text: string | null
          owner_id: string
          quantity: number | null
          receipt_id: string
          review_status: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_job_id?: string | null
          assignment_type?: string
          category?: string | null
          cleaned_name: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          line_number: number
          line_total?: number
          line_type?: string
          original_text?: string | null
          owner_id: string
          quantity?: number | null
          receipt_id: string
          review_status?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_job_id?: string | null
          assignment_type?: string
          category?: string | null
          cleaned_name?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          line_number?: number
          line_total?: number
          line_type?: string
          original_text?: string | null
          owner_id?: string
          quantity?: number | null
          receipt_id?: string
          review_status?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_line_items_assigned_job_id_fkey"
            columns: ["assigned_job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "receipt_line_items_assigned_job_id_fkey"
            columns: ["assigned_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          ai_confidence: number | null
          category: string | null
          created_at: string | null
          error_message: string | null
          extracted_json: Json | null
          id: string
          original_filename: string | null
          owner_id: string
          receipt_date: string | null
          review_status: string
          scan_context_job_id: string | null
          status: string
          storage_path: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          ai_confidence?: number | null
          category?: string | null
          created_at?: string | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          original_filename?: string | null
          owner_id: string
          receipt_date?: string | null
          review_status?: string
          scan_context_job_id?: string | null
          status?: string
          storage_path?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          ai_confidence?: number | null
          category?: string | null
          created_at?: string | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          original_filename?: string | null
          owner_id?: string
          receipt_date?: string | null
          review_status?: string
          scan_context_job_id?: string | null
          status?: string
          storage_path?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_scan_context_job_id_fkey"
            columns: ["scan_context_job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "receipts_scan_context_job_id_fkey"
            columns: ["scan_context_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          created_at: string | null
          description: string | null
          duration_minutes: number
          hourly_rate: number
          id: string
          job_id: string | null
          owner_id: string
          source: string
          started_at: string | null
          status: string
          stopped_at: string | null
          updated_at: string | null
          work_date: string
          worker_name: string | null
        }
        Insert: {
          billable?: boolean
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          hourly_rate?: number
          id?: string
          job_id?: string | null
          owner_id: string
          source?: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          updated_at?: string | null
          work_date?: string
          worker_name?: string | null
        }
        Update: {
          billable?: boolean
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          hourly_rate?: number
          id?: string
          job_id?: string | null
          owner_id?: string
          source?: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          updated_at?: string | null
          work_date?: string
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      job_financial_snapshots: {
        Row: {
          client_name: string | null
          job_id: string | null
          labor_cost: number | null
          name: string | null
          owner_id: string | null
          payments_received: number | null
          projected_margin_percent: number | null
          projected_profit: number | null
          quote_amount: number | null
          receipt_cost: number | null
          total_cost: number | null
          total_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tools_inventory_expenses: {
        Row: {
          billable: boolean | null
          created_at: string | null
          description: string | null
          expense_date: string | null
          expense_type: string | null
          id: string | null
          notes: string | null
          owner_id: string | null
          pre_tax_amount: number | null
          receipt_date: string | null
          receipt_id: string | null
          receipt_line_item_id: string | null
          receipt_storage_path: string | null
          receipt_vendor: string | null
          source_type: string | null
          status: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_receipt_line_item_id_fkey"
            columns: ["receipt_line_item_id"]
            isOneToOne: false
            referencedRelation: "receipt_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
