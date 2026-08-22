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
      activity_events: {
        Row: {
          actor_user_id: string | null
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
          detail: string | null
          event_type: string
          id: string
          job_id: string | null
          metadata: Json
          occurred_at: string
          owner_id: string
          resolved_at: string | null
          severity: string
          source_id: string | null
          source_table: string | null
          status: string
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          business_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          detail?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          metadata?: Json
          occurred_at?: string
          owner_id: string
          resolved_at?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title: string
        }
        Update: {
          actor_user_id?: string | null
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          detail?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          occurred_at?: string
          owner_id?: string
          resolved_at?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "activity_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "attachments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "job_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_items: {
        Row: {
          activity_event_id: string | null
          assigned_to_user_id: string | null
          business_id: string
          created_at: string
          detail: string | null
          id: string
          item_type: string
          job_id: string | null
          metadata: Json
          opened_at: string
          owner_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          severity: string
          source_id: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_event_id?: string | null
          assigned_to_user_id?: string | null
          business_id: string
          created_at?: string
          detail?: string | null
          id?: string
          item_type: string
          job_id?: string | null
          metadata?: Json
          opened_at?: string
          owner_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_event_id?: string | null
          assigned_to_user_id?: string | null
          business_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          item_type?: string
          job_id?: string | null
          metadata?: Json
          opened_at?: string
          owner_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attention_items_activity_event_id_fkey"
            columns: ["activity_event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attention_items_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attention_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attention_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "attention_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attention_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attention_items_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_entitlement_overrides: {
        Row: {
          business_id: string
          config: Json
          created_at: string
          enabled: boolean | null
          expires_at: string | null
          feature_id: string
          has_limit_override: boolean
          limit_value: number | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          config?: Json
          created_at?: string
          enabled?: boolean | null
          expires_at?: string | null
          feature_id: string
          has_limit_override?: boolean
          limit_value?: number | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean | null
          expires_at?: string | null
          feature_id?: string
          has_limit_override?: boolean
          limit_value?: number | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_entitlement_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_entitlement_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "subscription_features"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_subscriptions: {
        Row: {
          billing_provider: string | null
          business_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_ends_at: string | null
          plan_id: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_provider?: string | null
          business_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          plan_id: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_provider?: string | null
          business_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          plan_id?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          business_id: string
          company_name: string | null
          contact_type: string
          created_at: string | null
          created_by_user_id: string | null
          display_name: string
          email: string | null
          id: string
          notes: string | null
          owner_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by_user_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "contacts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "customer_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          actor_user_id: string | null
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          actor_user_id?: string | null
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          actor_user_id?: string | null
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "job_activity_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      job_contacts: {
        Row: {
          business_id: string
          contact_id: string
          created_at: string | null
          created_by_user_id: string | null
          id: string
          is_primary: boolean
          job_id: string
          owner_id: string
          role: string
        }
        Insert: {
          business_id?: string
          contact_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_primary?: boolean
          job_id: string
          owner_id: string
          role?: string
        }
        Update: {
          business_id?: string
          contact_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_primary?: boolean
          job_id?: string
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_contacts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      job_crew_members: {
        Row: {
          active: boolean
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
          hourly_rate: number
          id: string
          job_id: string
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          hourly_rate?: number
          id?: string
          job_id: string
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          hourly_rate?: number
          id?: string
          job_id?: string
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_crew_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_crew_members_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      job_notes: {
        Row: {
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
          id: string
          job_id: string | null
          note: string
          note_type: string
          owner_id: string
        }
        Insert: {
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          job_id?: string | null
          note: string
          note_type?: string
          owner_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          job_id?: string | null
          note?: string
          note_type?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "job_plans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_plans_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "job_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snapshots_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string
          client_name: string | null
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          client_name?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          client_name?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          feature_id: string
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          feature_id: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          feature_id?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "subscription_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_name: string | null
          created_at: string | null
          default_hourly_rate: number | null
          default_invoice_note: string | null
          default_invoice_terms: string | null
          full_name: string | null
          id: string
          invoice_email: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          default_invoice_note?: string | null
          default_invoice_terms?: string | null
          full_name?: string | null
          id: string
          invoice_email?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          default_invoice_note?: string | null
          default_invoice_terms?: string | null
          full_name?: string | null
          id?: string
          invoice_email?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          website?: string | null
        }
        Relationships: []
      }
      receipt_line_items: {
        Row: {
          assigned_job_id: string | null
          assignment_type: string
          business_id: string
          category: string | null
          cleaned_name: string
          confidence: number | null
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          category?: string | null
          cleaned_name: string
          confidence?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          category?: string | null
          cleaned_name?: string
          confidence?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "receipt_line_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_items_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      receipt_review_commits: {
        Row: {
          business_id: string
          committed_at: string
          committed_by_user_id: string | null
          id: string
          idempotency_key: string
          owner_id: string
          receipt_id: string
          request_fingerprint: string
          result: Json
          review_version: number
        }
        Insert: {
          business_id: string
          committed_at?: string
          committed_by_user_id?: string | null
          id?: string
          idempotency_key: string
          owner_id: string
          receipt_id: string
          request_fingerprint: string
          result?: Json
          review_version: number
        }
        Update: {
          business_id?: string
          committed_at?: string
          committed_by_user_id?: string | null
          id?: string
          idempotency_key?: string
          owner_id?: string
          receipt_id?: string
          request_fingerprint?: string
          result?: Json
          review_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_review_commits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_review_commits_committed_by_user_id_fkey"
            columns: ["committed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_review_commits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_review_commits_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          allocated_cost: number | null
          ai_confidence: number | null
          business_id: string
          category: string | null
          cost_basis: string | null
          created_at: string | null
          created_by_user_id: string | null
          error_message: string | null
          extracted_json: Json | null
          id: string
          last_review_commit_key: string | null
          last_processing_error: string | null
          original_filename: string | null
          owner_id: string
          processing_attempts: number
          processing_started_at: string | null
          processing_status: string
          receipt_date: string | null
          review_status: string
          review_version: number
          scan_context_job_id: string | null
          status: string
          storage_path: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string | null
          vendor: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          allocated_cost?: number | null
          ai_confidence?: number | null
          business_id?: string
          category?: string | null
          cost_basis?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          last_review_commit_key?: string | null
          last_processing_error?: string | null
          original_filename?: string | null
          owner_id: string
          processing_attempts?: number
          processing_started_at?: string | null
          processing_status?: string
          receipt_date?: string | null
          review_status?: string
          review_version?: number
          scan_context_job_id?: string | null
          status?: string
          storage_path?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          vendor?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          allocated_cost?: number | null
          ai_confidence?: number | null
          business_id?: string
          category?: string | null
          cost_basis?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          error_message?: string | null
          extracted_json?: Json | null
          id?: string
          last_review_commit_key?: string | null
          last_processing_error?: string | null
          original_filename?: string | null
          owner_id?: string
          processing_attempts?: number
          processing_started_at?: string | null
          processing_status?: string
          receipt_date?: string | null
          review_status?: string
          review_version?: number
          scan_context_job_id?: string | null
          status?: string
          storage_path?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
          vendor?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_voided_by_user_id_fkey"
            columns: ["voided_by_user_id"]
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
      shopping_need_fulfillments: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          initiated_by_user_id: string | null
          performed_by_type: string
          performed_by_user_id: string | null
          quantity: number | null
          receipt_line_item_id: string | null
          shopping_need_id: string
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          performed_by_type?: string
          performed_by_user_id?: string | null
          quantity?: number | null
          receipt_line_item_id?: string | null
          shopping_need_id: string
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          performed_by_type?: string
          performed_by_user_id?: string | null
          quantity?: number | null
          receipt_line_item_id?: string | null
          shopping_need_id?: string
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_need_fulfillments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_need_fulfillments_initiated_by_user_id_fkey"
            columns: ["initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_need_fulfillments_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_need_fulfillments_receipt_line_item_id_fkey"
            columns: ["receipt_line_item_id"]
            isOneToOne: false
            referencedRelation: "receipt_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_need_fulfillments_shopping_need_id_fkey"
            columns: ["shopping_need_id"]
            isOneToOne: false
            referencedRelation: "shopping_needs"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_needs: {
        Row: {
          assigned_to_user_id: string | null
          business_id: string
          completed_at: string | null
          created_at: string | null
          description: string
          dismissed_at: string | null
          id: string
          initiated_by_user_id: string | null
          job_id: string | null
          needed_by: string | null
          normalized_name: string | null
          notes: string | null
          owner_id: string
          performed_by_type: string
          performed_by_user_id: string | null
          quantity: number | null
          source_id: string | null
          source_type: string | null
          status: string
          unit: string | null
          updated_at: string | null
          user_display_text: string | null
          user_edited_at: string | null
          user_edited_by_user_id: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string | null
          description: string
          dismissed_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          job_id?: string | null
          needed_by?: string | null
          normalized_name?: string | null
          notes?: string | null
          owner_id: string
          performed_by_type?: string
          performed_by_user_id?: string | null
          quantity?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          unit?: string | null
          updated_at?: string | null
          user_display_text?: string | null
          user_edited_at?: string | null
          user_edited_by_user_id?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string
          dismissed_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          job_id?: string | null
          needed_by?: string | null
          normalized_name?: string | null
          notes?: string | null
          owner_id?: string
          performed_by_type?: string
          performed_by_user_id?: string | null
          quantity?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          unit?: string | null
          updated_at?: string | null
          user_display_text?: string | null
          user_edited_at?: string | null
          user_edited_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_needs_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_initiated_by_user_id_fkey"
            columns: ["initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "shopping_needs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_needs_user_edited_by_user_id_fkey"
            columns: ["user_edited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_features: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number
          feature_key: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          display_order?: number
          feature_key: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number
          feature_key?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          annual_price_cents: number | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_default: boolean
          is_public: boolean
          monthly_price_cents: number | null
          name: string
          plan_key: string
          updated_at: string
        }
        Insert: {
          annual_price_cents?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          monthly_price_cents?: number | null
          name: string
          plan_key: string
          updated_at?: string
        }
        Update: {
          annual_price_cents?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          monthly_price_cents?: number | null
          name?: string
          plan_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_usage: {
        Row: {
          business_id: string
          created_at: string
          metric_key: string
          period_end: string
          period_start: string
          quantity: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          metric_key: string
          period_end: string
          period_start: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          metric_key?: string
          period_end?: string
          period_start?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tell_contracktor_commits: {
        Row: {
          business_id: string
          committed_at: string
          committed_by_user_id: string
          entry_id: string
          owner_id: string
          proposal_payload: Json
          result: Json
          status: string
          undo_result: Json | null
          undone_at: string | null
          undone_by_user_id: string | null
        }
        Insert: {
          business_id: string
          committed_at?: string
          committed_by_user_id: string
          entry_id: string
          owner_id: string
          proposal_payload: Json
          result: Json
          status?: string
          undo_result?: Json | null
          undone_at?: string | null
          undone_by_user_id?: string | null
        }
        Update: {
          business_id?: string
          committed_at?: string
          committed_by_user_id?: string
          entry_id?: string
          owner_id?: string
          proposal_payload?: Json
          result?: Json
          status?: string
          undo_result?: Json | null
          undone_at?: string | null
          undone_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tell_contracktor_commits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_commits_committed_by_user_id_fkey"
            columns: ["committed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_commits_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "tell_contracktor_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_commits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_commits_undone_by_user_id_fkey"
            columns: ["undone_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tell_contracktor_entries: {
        Row: {
          business_id: string
          cleaned_note: string | null
          created_at: string | null
          created_by_user_id: string | null
          created_note_id: string | null
          extraction: Json
          id: string
          job_id: string | null
          owner_id: string
          raw_text: string
          status: string
          updated_at: string | null
        }
        Insert: {
          business_id?: string
          cleaned_note?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          created_note_id?: string | null
          extraction?: Json
          id?: string
          job_id?: string | null
          owner_id: string
          raw_text: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          cleaned_note?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          created_note_id?: string | null
          extraction?: Json
          id?: string
          job_id?: string | null
          owner_id?: string
          raw_text?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tell_contracktor_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_entries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_entries_created_note_id_fkey"
            columns: ["created_note_id"]
            isOneToOne: false
            referencedRelation: "job_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_financial_snapshots"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "tell_contracktor_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tell_contracktor_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
          business_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
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
            foreignKeyName: "time_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          business_id: string | null
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
            foreignKeyName: "jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string | null
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
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
    }
    Functions: {
      business_has_feature: {
        Args: { p_business_id: string; p_feature_key: string }
        Returns: boolean
      }
      claim_receipt_processing_jobs: {
        Args: { p_limit?: number; p_visibility_timeout?: number }
        Returns: {
          msg_id: number
          receipt_id: string
        }[]
      }
      commit_receipt_review: {
        Args: {
          p_expected_updated_at: string | null
          p_idempotency_key: string
          p_receipt_id: string
          p_review: Json
        }
        Returns: Json
      }
      commit_tell_contracktor_entry: {
        Args: { p_entry_id: string; p_proposals: Json }
        Returns: Json
      }
      commit_tell_contracktor_entry_once: {
        Args: { p_entry_id: string; p_proposals: Json }
        Returns: Json
      }
      default_business_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      delete_receipt_processing_job: {
        Args: { p_msg_id: number }
        Returns: boolean
      }
      finalize_receipt_capture: {
        Args: { p_receipt_id: string }
        Returns: {
          allocated_cost: number | null
          ai_confidence: number | null
          business_id: string
          category: string | null
          cost_basis: string | null
          created_at: string | null
          created_by_user_id: string | null
          error_message: string | null
          extracted_json: Json | null
          id: string
          last_review_commit_key: string | null
          last_processing_error: string | null
          original_filename: string | null
          owner_id: string
          processing_attempts: number
          processing_started_at: string | null
          processing_status: string
          receipt_date: string | null
          review_status: string
          review_version: number
          scan_context_job_id: string | null
          status: string
          storage_path: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string | null
          vendor: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_entitlements: { Args: { p_business_id?: string }; Returns: Json }
      mark_receipt_processing: {
        Args: { p_receipt_id: string }
        Returns: {
          allocated_cost: number | null
          ai_confidence: number | null
          business_id: string
          category: string | null
          cost_basis: string | null
          created_at: string | null
          created_by_user_id: string | null
          error_message: string | null
          extracted_json: Json | null
          id: string
          last_review_commit_key: string | null
          last_processing_error: string | null
          original_filename: string | null
          owner_id: string
          processing_attempts: number
          processing_started_at: string | null
          processing_status: string
          receipt_date: string | null
          review_status: string
          review_version: number
          scan_context_job_id: string | null
          status: string
          storage_path: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string | null
          vendor: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_attention_item: {
        Args: {
          p_attention_item_id: string
          p_resolution_note?: string
          p_resolution_status?: string
        }
        Returns: {
          activity_event_id: string | null
          assigned_to_user_id: string | null
          business_id: string
          created_at: string
          detail: string | null
          id: string
          item_type: string
          job_id: string | null
          metadata: Json
          opened_at: string
          owner_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          severity: string
          source_id: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attention_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_receipt_attention: {
        Args: { p_receipt_id: string }
        Returns: number
      }
      require_receipt_line_review: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      remove_receipt: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      start_job_timer_atomic: {
        Args: {
          p_hourly_rate: number
          p_job_id: string
          p_worker_name?: string
        }
        Returns: {
          billable: boolean
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
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
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_tell_contracktor_entry: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      undo_tell_contracktor_entry_once: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      upsert_activity_event: {
        Args: {
          p_actor_user_id: string
          p_business_id: string
          p_created_by_user_id: string
          p_detail: string
          p_event_type: string
          p_job_id: string
          p_metadata?: Json
          p_occurred_at?: string
          p_owner_id: string
          p_severity: string
          p_source_id: string
          p_source_table: string
          p_status: string
          p_title: string
        }
        Returns: {
          actor_user_id: string | null
          business_id: string
          created_at: string | null
          created_by_user_id: string | null
          detail: string | null
          event_type: string
          id: string
          job_id: string | null
          metadata: Json
          occurred_at: string
          owner_id: string
          resolved_at: string | null
          severity: string
          source_id: string | null
          source_table: string | null
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_can_manage_business: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      user_is_business_member: {
        Args: { p_business_id: string }
        Returns: boolean
      }
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
