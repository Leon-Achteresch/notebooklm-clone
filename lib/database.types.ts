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
      ai_usage: {
        Row: {
          day: string
          requests: number
          user_id: string
        }
        Insert: {
          day?: string
          requests?: number
          user_id: string
        }
        Update: {
          day?: string
          requests?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          citations: Json
          content: string
          created_at: string
          id: string
          notebook_id: string
          role: Database["public"]["Enums"]["message_role"]
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          created_at?: string
          id?: string
          notebook_id: string
          role: Database["public"]["Enums"]["message_role"]
          user_id?: string
        }
        Update: {
          citations?: Json
          content?: string
          created_at?: string
          id?: string
          notebook_id?: string
          role?: Database["public"]["Enums"]["message_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_members: {
        Row: {
          email: string
          notebook_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          email: string
          notebook_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          email?: string
          notebook_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_members_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notebook_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notebooks: {
        Row: {
          created_at: string
          guide: Json | null
          id: string
          instructions: string
          is_public: boolean
          owner_id: string
          title: string
        }
        Insert: {
          created_at?: string
          guide?: Json | null
          id?: string
          instructions?: string
          is_public?: boolean
          owner_id?: string
          title?: string
        }
        Update: {
          created_at?: string
          guide?: Json | null
          id?: string
          instructions?: string
          is_public?: boolean
          owner_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebooks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          data: Json | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["note_kind"]
          notebook_id: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["note_kind"]
          notebook_id: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["note_kind"]
          notebook_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          notebook_id: string
          selected: boolean
          storage_path: string | null
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          notebook_id: string
          selected?: boolean
          storage_path?: string | null
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          notebook_id?: string
          selected?: boolean
          storage_path?: string | null
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_notebook: { Args: { nid: string }; Returns: boolean }
      consume_ai_quota: { Args: never; Returns: number }
      invite_member: {
        Args: { member_email: string; member_role: string; nid: string }
        Returns: undefined
      }
      notebook_role: { Args: { nid: string }; Returns: string }
    }
    Enums: {
      job_status: "pending" | "ready" | "failed"
      member_role: "viewer" | "editor"
      message_role: "user" | "assistant"
      note_kind: "note" | "report" | "flashcards" | "quiz" | "mindmap" | "audio"
      source_kind: "text" | "url" | "pdf"
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
      job_status: ["pending", "ready", "failed"],
      member_role: ["viewer", "editor"],
      message_role: ["user", "assistant"],
      note_kind: ["note", "report", "flashcards", "quiz", "mindmap", "audio"],
      source_kind: ["text", "url", "pdf"],
    },
  },
} as const
