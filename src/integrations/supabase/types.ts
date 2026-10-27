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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          company_name: string
          confirmed_at: string | null
          confirmed_by: string | null
          currency_code: string
          currency_confirmed: boolean
          currency_symbol: string
          id: number
          recurring_cadence: string | null
          recurring_due_days: number | null
          updated_at: string
        }
        Insert: {
          company_name?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          currency_code?: string
          currency_confirmed?: boolean
          currency_symbol?: string
          id?: number
          recurring_cadence?: string | null
          recurring_due_days?: number | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          currency_code?: string
          currency_confirmed?: boolean
          currency_symbol?: string
          id?: number
          recurring_cadence?: string | null
          recurring_due_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      credit_notes: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          reason: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          reason: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_number: string
          created_at: string
          customer_type: string
          email: string | null
          full_name: string
          id: string
          location_id: string | null
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_number?: string
          created_at?: string
          customer_type?: string
          email?: string | null
          full_name: string
          id?: string
          location_id?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          created_at?: string
          customer_type?: string
          email?: string | null
          full_name?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_loans: {
        Row: {
          condition: string | null
          created_at: string
          customer_id: string
          id: string
          item_id: string
          loaned_at: string
          recorded_by: string | null
          returned_at: string | null
          serial: string
          status: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          customer_id: string
          id?: string
          item_id: string
          loaned_at?: string
          recorded_by?: string | null
          returned_at?: string | null
          serial: string
          status?: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          item_id?: string
          loaned_at?: string
          recorded_by?: string | null
          returned_at?: string | null
          serial?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_loans_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_code: string
          base_per_quote: number
          created_at: string
          id: string
          note: string | null
          quote_code: string
          quote_symbol: string
          set_by: string
        }
        Insert: {
          base_code?: string
          base_per_quote: number
          created_at?: string
          id?: string
          note?: string | null
          quote_code?: string
          quote_symbol?: string
          set_by: string
        }
        Update: {
          base_code?: string
          base_per_quote?: number
          created_at?: string
          id?: string
          note?: string | null
          quote_code?: string
          quote_symbol?: string
          set_by?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          id: string
          loanable: boolean
          name: string
          reorder_level: number
          sku: string
          stock_qty: number
          unit: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          loanable?: boolean
          name: string
          reorder_level?: number
          sku: string
          stock_qty?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          loanable?: boolean
          name?: string
          reorder_level?: number
          sku?: string
          stock_qty?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          invoice_id: string
          note: string | null
          recipient: string | null
          recorded_by: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id: string
          note?: string | null
          recipient?: string | null
          recorded_by?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          note?: string | null
          recipient?: string | null
          recorded_by?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency_code: string
          currency_symbol: string
          customer_id: string
          due_date: string
          id: string
          issued_at: string | null
          notes: string | null
          number: string
          period_end: string | null
          period_start: string | null
          state: string
          subscription_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          currency_symbol: string
          customer_id: string
          due_date: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string
          period_end?: string | null
          period_start?: string | null
          state?: string
          subscription_id?: string | null
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          customer_id?: string
          due_date?: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string
          period_end?: string | null
          period_start?: string | null
          state?: string
          subscription_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          district: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          pop_site: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          district?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          pop_site?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          district?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          pop_site?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      network_devices: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          endpoint_ref: string
          id: string
          kind: string
          last_health_at: string | null
          last_health_detail: string | null
          last_health_status: string
          location_id: string | null
          model: string | null
          name: string
          notes: string | null
          routeros_version: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint_ref: string
          id?: string
          kind?: string
          last_health_at?: string | null
          last_health_detail?: string | null
          last_health_status?: string
          location_id?: string | null
          model?: string | null
          name: string
          notes?: string | null
          routeros_version?: string | null
          updated_at?: string
          vendor?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint_ref?: string
          id?: string
          kind?: string
          last_health_at?: string | null
          last_health_detail?: string | null
          last_health_status?: string
          location_id?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          routeros_version?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
          reversed: boolean
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
          reversed?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          reversed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          channel: string
          created_at: string
          currency_code: string
          currency_symbol: string
          customer_id: string | null
          failed: boolean
          failure_reason: string | null
          id: string
          notes: string | null
          received_date: string
          reference: string
          reversal_reason: string | null
          reversed: boolean
          updated_at: string
        }
        Insert: {
          amount: number
          channel: string
          created_at?: string
          currency_code: string
          currency_symbol: string
          customer_id?: string | null
          failed?: boolean
          failure_reason?: string | null
          id?: string
          notes?: string | null
          received_date: string
          reference: string
          reversal_reason?: string | null
          reversed?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: string
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          customer_id?: string | null
          failed?: boolean
          failure_reason?: string | null
          id?: string
          notes?: string | null
          received_date?: string
          reference?: string
          reversal_reason?: string | null
          reversed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      router_actions: {
        Row: {
          action: string
          attempts: number
          created_at: string
          detail: string | null
          device_id: string
          dry_run: boolean
          duration_ms: number | null
          id: string
          idempotency_key: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          detail?: string | null
          device_id: string
          dry_run?: boolean
          duration_ms?: number | null
          id?: string
          idempotency_key: string
          requested_by: string
          status: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          detail?: string | null
          device_id?: string
          dry_run?: boolean
          duration_ms?: number | null
          id?: string
          idempotency_key?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_actions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "network_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plans: {
        Row: {
          active: boolean
          created_at: string
          download_mbps: number
          id: string
          monthly_price: number
          name: string
          technology: string
          updated_at: string
          upload_mbps: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          download_mbps: number
          id?: string
          monthly_price: number
          name: string
          technology?: string
          updated_at?: string
          upload_mbps: number
        }
        Update: {
          active?: boolean
          created_at?: string
          download_mbps?: number
          id?: string
          monthly_price?: number
          name?: string
          technology?: string
          updated_at?: string
          upload_mbps?: number
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          item_id: string
          kind: string
          loan_id: string | null
          note: string | null
          quantity: number
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          item_id: string
          kind: string
          loan_id?: string | null
          note?: string | null
          quantity: number
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          item_id?: string
          kind?: string
          loan_id?: string | null
          note?: string | null
          quantity?: number
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "equipment_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          end_date: string | null
          id: string
          ip_address: string | null
          plan_id: string
          pppoe_username: string | null
          start_date: string | null
          status: string
          updated_at: string
          vlan: number | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          end_date?: string | null
          id?: string
          ip_address?: string | null
          plan_id: string
          pppoe_username?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          vlan?: number | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          end_date?: string | null
          id?: string
          ip_address?: string | null
          plan_id?: string
          pppoe_username?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          vlan?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          id: string
          number: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          number?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          number?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_samples: {
        Row: {
          bucket_start: string
          created_at: string
          id: string
          rx_bytes: number
          subscription_id: string
          tx_bytes: number
        }
        Insert: {
          bucket_start: string
          created_at?: string
          id?: string
          rx_bytes?: number
          subscription_id: string
          tx_bytes?: number
        }
        Update: {
          bucket_start?: string
          created_at?: string
          id?: string
          rx_bytes?: number
          subscription_id?: string
          tx_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_samples_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _move_stock: {
        Args: {
          _customer: string
          _delta: number
          _item: string
          _kind: string
          _loan: string
          _note: string
          _ticket: string
        }
        Returns: string
      }
      adjust_stock: {
        Args: {
          _item_id: string
          _kind: string
          _note: string
          _quantity: number
        }
        Returns: string
      }
      allocate_payment: {
        Args: { _amount: number; _invoice_id: string; _payment_id: string }
        Returns: undefined
      }
      complete_password_change: { Args: never; Returns: undefined }
      create_invoice: {
        Args: {
          _customer_id: string
          _due_date: string
          _items: Json
          _notes?: string
          _subscription_id?: string
        }
        Returns: string
      }
      generate_recurring_invoices: {
        Args: { _period_start: string }
        Returns: number
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["staff_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["staff_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      issue_credit_note: {
        Args: { _amount: number; _invoice_id: string; _reason: string }
        Returns: string
      }
      loan_equipment: {
        Args: { _customer_id: string; _item_id: string; _serial: string }
        Returns: string
      }
      log_invoice_reminder: {
        Args: {
          _channel: string
          _invoice_id: string
          _note?: string
          _recipient?: string
        }
        Returns: string
      }
      mark_payment_failed: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      preview_recurring_invoices: {
        Args: { _period_start: string }
        Returns: {
          already_invoiced: boolean
          amount: number
          customer_id: string
          customer_name: string
          period_end: string
          period_start: string
          plan_name: string
          subscription_id: string
        }[]
      }
      record_payment: {
        Args: {
          _amount: number
          _channel: string
          _customer_id: string
          _notes?: string
          _received_date: string
          _reference: string
        }
        Returns: string
      }
      record_supply_usage: {
        Args: {
          _customer_id: string
          _item_id: string
          _note: string
          _quantity: number
          _ticket_id: string
        }
        Returns: string
      }
      require_billing_writer: { Args: never; Returns: undefined }
      return_equipment: {
        Args: { _condition: string; _loan_id: string; _outcome: string }
        Returns: undefined
      }
      reverse_payment: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      set_exchange_rate: {
        Args: { _base_per_quote: number; _note?: string }
        Returns: string
      }
      set_invoice_state: {
        Args: { _id: string; _state: string }
        Returns: undefined
      }
      set_reminder_status: {
        Args: { _id: string; _reason?: string; _status: string }
        Returns: undefined
      }
      usage_series: {
        Args: {
          _from: string
          _granularity: string
          _subscription_id: string
          _to: string
        }
        Returns: {
          bucket_start: string
          rx_bytes: number
          tx_bytes: number
        }[]
      }
    }
    Enums: {
      staff_role:
        | "admin"
        | "noc"
        | "finance"
        | "care"
        | "tech"
        | "warehouse"
        | "readonly"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      staff_role: [
        "admin",
        "noc",
        "finance",
        "care",
        "tech",
        "warehouse",
        "readonly",
      ],
    },
  },
} as const
