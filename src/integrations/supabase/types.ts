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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      blocked_ips: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string
          is_global: boolean
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address: string
          is_global?: boolean
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string
          is_global?: boolean
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          domain: string | null
          hash: string
          id: string
          is_active: boolean | null
          name: string
          offer_page_b: string | null
          offer_url: string
          postback_method: string
          postback_url: string | null
          safe_url: string
          strict_mode: boolean
          tags: string[] | null
          target_countries: string[] | null
          target_devices: string[] | null
          traffic_source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          hash: string
          id?: string
          is_active?: boolean | null
          name: string
          offer_page_b?: string | null
          offer_url: string
          postback_method?: string
          postback_url?: string | null
          safe_url: string
          strict_mode?: boolean
          tags?: string[] | null
          target_countries?: string[] | null
          target_devices?: string[] | null
          traffic_source: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          hash?: string
          id?: string
          is_active?: boolean | null
          name?: string
          offer_page_b?: string | null
          offer_url?: string
          postback_method?: string
          postback_url?: string | null
          safe_url?: string
          strict_mode?: boolean
          tags?: string[] | null
          target_countries?: string[] | null
          target_devices?: string[] | null
          traffic_source?: string
          user_id?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          cloudflare_hostname_id: string | null
          created_at: string
          id: string
          is_verified: boolean | null
          ownership_token: string | null
          ssl_status: string | null
          url: string
          user_id: string
          verification_errors: string | null
        }
        Insert: {
          cloudflare_hostname_id?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean | null
          ownership_token?: string | null
          ssl_status?: string | null
          url: string
          user_id: string
          verification_errors?: string | null
        }
        Update: {
          cloudflare_hostname_id?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean | null
          ownership_token?: string | null
          ssl_status?: string | null
          url?: string
          user_id?: string
          verification_errors?: string | null
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      ip_cache: {
        Row: {
          checked_at: string
          id: string
          ip: string
          is_threat: boolean
          reason: string | null
        }
        Insert: {
          checked_at?: string
          id?: string
          ip: string
          is_threat: boolean
          reason?: string | null
        }
        Update: {
          checked_at?: string
          id?: string
          ip?: string
          is_threat?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activation_status: string | null
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          created_at: string
          current_clicks: number | null
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_deleted: boolean
          is_suspended: boolean
          language: string
          max_clicks: number | null
          max_domains: number | null
          plan_name: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          // activation_status is GENERATED ALWAYS — never insertable.
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          current_clicks?: number | null
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_deleted?: boolean
          is_suspended?: boolean
          language?: string
          max_clicks?: number | null
          max_domains?: number | null
          plan_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          // activation_status is GENERATED ALWAYS — never updatable.
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          current_clicks?: number | null
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_deleted?: boolean
          is_suspended?: boolean
          language?: string
          max_clicks?: number | null
          max_domains?: number | null
          plan_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          duration_days: number
          id: string
          is_active: boolean
          max_uses: number
          target_plan: string
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          duration_days?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          target_plan: string
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          duration_days?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          target_plan?: string
        }
        Relationships: []
      }
      requests_log: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"]
          block_reason: string | null
          campaign_id: string
          campaign_name_platform: string | null
          click_id: string | null
          cost: number | null
          country_code: string | null
          created_at: string
          device_type: Database["public"]["Enums"]["device_type"] | null
          id: string
          ip_address: string | null
          is_conversion: boolean | null
          is_unique: boolean | null
          revenue: number | null
          risk_score: number | null
          source_platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_taken: Database["public"]["Enums"]["action_taken"]
          block_reason?: string | null
          campaign_id: string
          campaign_name_platform?: string | null
          click_id?: string | null
          cost?: number | null
          country_code?: string | null
          created_at?: string
          device_type?: Database["public"]["Enums"]["device_type"] | null
          id?: string
          ip_address?: string | null
          is_conversion?: boolean | null
          is_unique?: boolean | null
          revenue?: number | null
          risk_score?: number | null
          source_platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["action_taken"]
          block_reason?: string | null
          campaign_id?: string
          campaign_name_platform?: string | null
          click_id?: string | null
          cost?: number | null
          country_code?: string | null
          created_at?: string
          device_type?: Database["public"]["Enums"]["device_type"] | null
          id?: string
          ip_address?: string | null
          is_conversion?: boolean | null
          is_unique?: boolean | null
          revenue?: number | null
          risk_score?: number | null
          source_platform?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_analytics_view: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"] | null
          block_reason: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_name_platform: string | null
          click_id: string | null
          cost: number | null
          country_code: string | null
          created_at: string | null
          device_type: Database["public"]["Enums"]["device_type"] | null
          id: string | null
          ip_address: string | null
          is_conversion: boolean | null
          is_unique: boolean | null
          motivo_limpo: string | null
          revenue: number | null
          risk_score: number | null
          source_platform: string | null
          status_final: string | null
          user_agent: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_change_plan: {
        Args: {
          p_max_clicks: number
          p_max_domains: number
          p_plan_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_list_users: {
        Args: never
        Returns: {
          billing_cycle_end: string
          campaign_count: number
          created_at: string
          current_clicks: number
          domain_count: number
          email: string
          is_suspended: boolean
          max_clicks: number
          plan_name: string
          user_id: string
        }[]
      }
      admin_reset_billing: { Args: { p_user_id: string }; Returns: undefined }
      admin_toggle_suspend: {
        Args: { p_suspend: boolean; p_user_id: string }
        Returns: undefined
      }
      get_block_reasons_summary: {
        Args: { p_campaign_id?: string }
        Returns: {
          motivo: string
          total: number
        }[]
      }
      get_campaign_redirect: { Args: { p_hash: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_billing_renewals: { Args: never; Returns: Json }
      redeem_promo_code: { Args: { p_code: string }; Returns: Json }
      use_invite_code: { Args: { p_code: string }; Returns: boolean }
      use_invite_code_admin: { Args: { p_code: string }; Returns: boolean }
      validate_invite_code: { Args: { p_code: string }; Returns: boolean }
    }
    Enums: {
      action_taken: "safe_page" | "offer_page" | "bot_blocked"
      app_role: "admin" | "moderator" | "user"
      device_type: "mobile" | "desktop"
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
    Enums: {
      action_taken: ["safe_page", "offer_page", "bot_blocked"],
      app_role: ["admin", "moderator", "user"],
      device_type: ["mobile", "desktop"],
    },
  },
} as const
