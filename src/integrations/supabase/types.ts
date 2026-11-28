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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          language: string
          patient_name: string
          phone: string
          slot_id: string
          status: string
          symptoms: string | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          language?: string
          patient_name: string
          phone: string
          slot_id: string
          status?: string
          symptoms?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          language?: string
          patient_name?: string
          phone?: string
          slot_id?: string
          status?: string
          symptoms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          created_at: string
          entities: Json
          id: string
          language: string
          summary: string | null
          transcript: Json
        }
        Insert: {
          created_at?: string
          entities?: Json
          id?: string
          language?: string
          summary?: string | null
          transcript?: Json
        }
        Update: {
          created_at?: string
          entities?: Json
          id?: string
          language?: string
          summary?: string | null
          transcript?: Json
        }
        Relationships: []
      }
      doctors: {
        Row: {
          created_at: string
          full_name: string
          id: string
          room: string
          specialty_ky: string
          specialty_ru: string
          status: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          room: string
          specialty_ky: string
          specialty_ru: string
          status?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          room?: string
          specialty_ky?: string
          specialty_ru?: string
          status?: string
        }
        Relationships: []
      }
      schedule_slots: {
        Row: {
          doctor_id: string
          id: string
          slot_date: string
          slot_time: string
          status: string
        }
        Insert: {
          doctor_id: string
          id?: string
          slot_date: string
          slot_time: string
          status?: string
        }
        Update: {
          doctor_id?: string
          id?: string
          slot_date?: string
          slot_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_settings: {
        Row: {
          enabled: boolean
          global_monthly_chars: number
          id: boolean
          per_user_daily_chars: number
          per_user_monthly_chars: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          global_monthly_chars?: number
          id?: boolean
          per_user_daily_chars?: number
          per_user_monthly_chars?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          global_monthly_chars?: number
          id?: boolean
          per_user_daily_chars?: number
          per_user_monthly_chars?: number
          updated_at?: string
        }
        Relationships: []
      }
      tts_usage: {
        Row: {
          cached: boolean
          chars: number
          created_at: string
          id: string
          session_id: string
          voice: string
        }
        Insert: {
          cached?: boolean
          chars: number
          created_at?: string
          id?: string
          session_id: string
          voice: string
        }
        Update: {
          cached?: boolean
          chars?: number
          created_at?: string
          id?: string
          session_id?: string
          voice?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_slot: {
        Args: {
          _lang: string
          _name: string
          _phone: string
          _slot_id: string
          _symptoms: string
        }
        Returns: string
      }
      cancel_appointment: { Args: { _appt_id: string }; Returns: boolean }
      get_tts_admin_stats: { Args: never; Returns: Json }
      get_tts_quota: { Args: { _session_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      prepare_tts: {
        Args: {
          _cached: boolean
          _chars: number
          _session_id: string
          _voice: string
        }
        Returns: Json
      }
      update_tts_settings: {
        Args: {
          _daily: number
          _enabled: boolean
          _global: number
          _monthly: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "staff"
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
      app_role: ["staff"],
    },
  },
} as const
