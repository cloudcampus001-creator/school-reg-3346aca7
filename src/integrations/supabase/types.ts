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
      admission_field_defs: {
        Row: {
          created_at: string
          data_type: Database["public"]["Enums"]["admission_field_type"]
          id: string
          is_required: boolean
          label: string
          options: Json | null
          school_year_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["admission_field_type"]
          id?: string
          is_required?: boolean
          label: string
          options?: Json | null
          school_year_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["admission_field_type"]
          id?: string
          is_required?: boolean
          label?: string
          options?: Json | null
          school_year_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "admission_field_defs_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      class_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          school_year_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          school_year_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          school_year_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_levels_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          level_id: string | null
          name: string
          school_id: string
          school_year_id: string | null
          segmented_registration_fee: number | null
          segmented_tuition_fee: number | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          level_id?: string | null
          name: string
          school_id: string
          school_year_id?: string | null
          segmented_registration_fee?: number | null
          segmented_tuition_fee?: number | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          level_id?: string | null
          name?: string
          school_id?: string
          school_year_id?: string | null
          segmented_registration_fee?: number | null
          segmented_tuition_fee?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "class_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string | null
          id: string
          payment_method: string
          payment_phone: string | null
          reference: string | null
          school_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          payment_method: string
          payment_phone?: string | null
          reference?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          payment_method?: string
          payment_phone?: string | null
          reference?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id?: string
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          content: string
          created_at: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["print_job_status"]
          transaction_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["print_job_status"]
          transaction_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["print_job_status"]
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      school_configs: {
        Row: {
          created_at: string
          currency: string
          fee_structure: Database["public"]["Enums"]["fee_structure"]
          id: string
          min_installment_amount: number | null
          school_id: string
          school_year_id: string | null
          settlement_account: string | null
          uniform_registration_fee: number
          uniform_tuition_fee: number
        }
        Insert: {
          created_at?: string
          currency?: string
          fee_structure?: Database["public"]["Enums"]["fee_structure"]
          id?: string
          min_installment_amount?: number | null
          school_id: string
          school_year_id?: string | null
          settlement_account?: string | null
          uniform_registration_fee?: number
          uniform_tuition_fee?: number
        }
        Update: {
          created_at?: string
          currency?: string
          fee_structure?: Database["public"]["Enums"]["fee_structure"]
          id?: string
          min_installment_amount?: number | null
          school_id?: string
          school_year_id?: string | null
          settlement_account?: string | null
          uniform_registration_fee?: number
          uniform_tuition_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_configs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_configs_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_years: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          label: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["school_year_status"]
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          label: string
          school_id: string
          starts_on?: string
          status?: Database["public"]["Enums"]["school_year_status"]
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          label?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["school_year_status"]
        }
        Relationships: [
          {
            foreignKeyName: "school_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      student_enrollments: {
        Row: {
          class_id: string | null
          created_at: string
          dismissed: boolean
          dismissed_reason: string | null
          enrollment_kind: Database["public"]["Enums"]["enrollment_kind"]
          extra_fields: Json
          id: string
          is_registered: boolean
          promotion_decision:
            | Database["public"]["Enums"]["promotion_decision"]
            | null
          school_year_id: string
          student_id: string
          tuition_paid: number
          tuition_required: number
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          dismissed?: boolean
          dismissed_reason?: string | null
          enrollment_kind?: Database["public"]["Enums"]["enrollment_kind"]
          extra_fields?: Json
          id?: string
          is_registered?: boolean
          promotion_decision?:
            | Database["public"]["Enums"]["promotion_decision"]
            | null
          school_year_id: string
          student_id: string
          tuition_paid?: number
          tuition_required?: number
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          dismissed?: boolean
          dismissed_reason?: string | null
          enrollment_kind?: Database["public"]["Enums"]["enrollment_kind"]
          extra_fields?: Json
          id?: string
          is_registered?: boolean
          promotion_decision?:
            | Database["public"]["Enums"]["promotion_decision"]
            | null
          school_year_id?: string
          student_id?: string
          tuition_paid?: number
          tuition_required?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          date_of_birth: string
          full_name: string
          gender: string
          id: string
          matricule: string | null
          parent_phone: string
          place_of_birth: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          full_name: string
          gender: string
          id?: string
          matricule?: string | null
          parent_phone: string
          place_of_birth?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          full_name?: string
          gender?: string
          id?: string
          matricule?: string | null
          parent_phone?: string
          place_of_birth?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admit_student: {
        Args: {
          _class_id: string
          _dob: string
          _extra: Json
          _full_name: string
          _gender: string
          _phone: string
          _place: string
          _school_id: string
          _school_slug: string
        }
        Returns: string
      }
      close_school_year: { Args: { _school_id: string }; Returns: undefined }
      compute_registration_required: {
        Args: { _class_id: string; _year_id: string }
        Returns: number
      }
      compute_tuition_required: {
        Args: { _class_id: string; _year_id: string }
        Returns: number
      }
      create_school_year: { Args: { _payload: Json }; Returns: string }
      dismiss_student: {
        Args: { _enrollment_id: string; _reason: string }
        Returns: undefined
      }
      generate_matricule:
        | { Args: { _school_slug: string }; Returns: string }
        | {
            Args: { _school_slug: string; _year_label: string }
            Returns: string
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_payment: {
        Args: {
          _amount: number
          _enrollment_id: string
          _method: string
          _phone: string
          _type: string
        }
        Returns: {
          reference: string
          transaction_id: string
        }[]
      }
      search_students: {
        Args: { _q: string; _school_id: string; _year_id: string }
        Returns: {
          class_id: string
          class_name: string
          enrollment_id: string
          full_name: string
          is_registered: boolean
          level_name: string
          matricule: string
          score: number
          student_id: string
          tuition_paid: number
          tuition_required: number
        }[]
      }
      set_promotion: {
        Args: { _decision: string; _enrollment_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      admission_field_type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT"
      app_role: "admin" | "bursar"
      enrollment_kind: "NEW_ADMIT" | "OLD_STUDENT"
      fee_structure: "UNIFORM" | "SEGMENTED"
      print_job_status: "PENDING" | "PRINTED" | "FAILED"
      promotion_decision: "PROMOTED" | "REPEATED"
      school_year_status: "OPEN" | "CLOSED"
      transaction_status: "PENDING" | "SUCCESS" | "FAILED"
      transaction_type: "REGISTRATION" | "TUITION"
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
      admission_field_type: ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"],
      app_role: ["admin", "bursar"],
      enrollment_kind: ["NEW_ADMIT", "OLD_STUDENT"],
      fee_structure: ["UNIFORM", "SEGMENTED"],
      print_job_status: ["PENDING", "PRINTED", "FAILED"],
      promotion_decision: ["PROMOTED", "REPEATED"],
      school_year_status: ["OPEN", "CLOSED"],
      transaction_status: ["PENDING", "SUCCESS", "FAILED"],
      transaction_type: ["REGISTRATION", "TUITION"],
    },
  },
} as const
