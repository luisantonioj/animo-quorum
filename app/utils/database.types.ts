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
      AuditLogs: {
        Row: {
          action_type: string
          admin_id: string | null
          created_at: string | null
          id: string
          target_id: string | null
        }
        Insert: {
          action_type: string
          admin_id?: string | null
          created_at?: string | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string | null
          created_at?: string | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AuditLogs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Candidates: {
        Row: {
          created_at: string | null
          credentials: string | null
          election_cycle_id: string
          email: string | null
          id: string
          name: string
          partylist: string | null
          photo_url: string | null
          platform: string | null
          position_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credentials?: string | null
          election_cycle_id: string
          email?: string | null
          id?: string
          name: string
          partylist?: string | null
          photo_url?: string | null
          platform?: string | null
          position_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credentials?: string | null
          election_cycle_id?: string
          email?: string | null
          id?: string
          name?: string
          partylist?: string | null
          photo_url?: string | null
          platform?: string | null
          position_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Candidates_election_cycle_id_fkey"
            columns: ["election_cycle_id"]
            isOneToOne: false
            referencedRelation: "ElectionCycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Candidates_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "Positions"
            referencedColumns: ["id"]
          },
        ]
      }
      ElectionCycles: {
        Row: {
          created_at: string | null
          id: string
          is_miting_active: boolean | null
          label: string
          show_live_results: boolean | null
          status: string
          updated_at: string | null
          voting_end_time: string | null
          voting_start_time: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_miting_active?: boolean | null
          label: string
          show_live_results?: boolean | null
          status?: string
          updated_at?: string | null
          voting_end_time?: string | null
          voting_start_time?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_miting_active?: boolean | null
          label?: string
          show_live_results?: boolean | null
          status?: string
          updated_at?: string | null
          voting_end_time?: string | null
          voting_start_time?: string | null
        }
        Relationships: []
      }
      Comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          parent_id: string | null
          post_id: string
          student_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
          student_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "Comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "Comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "Posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Comments_student_id_fkey1"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["auth_id"]
          },
        ]
      }
      Likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "Posts"
            referencedColumns: ["id"]
          },
        ]
      }
      MitingQuestions: {
        Row: {
          created_at: string | null
          id: string
          is_approved: boolean | null
          question_text: string
          student_id: string
          upvote_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          question_text: string
          student_id: string
          upvote_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          question_text?: string
          student_id?: string
          upvote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "MitingQuestions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Notifications: {
        Row: {
          event_trigger: string
          id: string
          message_body: string
          title: string
          updated_at: string | null
        }
        Insert: {
          event_trigger: string
          id?: string
          message_body: string
          title: string
          updated_at?: string | null
        }
        Update: {
          event_trigger?: string
          id?: string
          message_body?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      PollOptions: {
        Row: {
          id: string
          option_text: string
          post_id: string
        }
        Insert: {
          id?: string
          option_text: string
          post_id: string
        }
        Update: {
          id?: string
          option_text?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "PollOptions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "Posts"
            referencedColumns: ["id"]
          },
        ]
      }
      PollResponses: {
        Row: {
          created_at: string | null
          id: string
          poll_option_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          poll_option_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          poll_option_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "PollResponses_poll_option_id_fkey"
            columns: ["poll_option_id"]
            isOneToOne: false
            referencedRelation: "PollOptions"
            referencedColumns: ["id"]
          },
        ]
      }
      Positions: {
        Row: {
          college: string | null
          created_at: string | null
          display_order: number
          id: string
          position_name: string
          program: string | null
        }
        Insert: {
          college?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          position_name: string
          program?: string | null
        }
        Update: {
          college?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          position_name?: string
          program?: string | null
        }
        Relationships: []
      }
      Posts: {
        Row: {
          admin_id: string | null
          content: string | null
          created_at: string | null
          id: string
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Posts_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      QuestionUpvotes: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "QuestionUpvotes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "MitingQuestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "QuestionUpvotes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Roles: {
        Row: {
          created_at: string | null
          id: string
          role_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role_name?: string
        }
        Relationships: []
      }
      SystemSettings: {
        Row: {
          id: string
          is_miting_active: boolean | null
          show_live_results: boolean | null
          updated_at: string | null
          voting_end_time: string | null
          voting_start_time: string | null
        }
        Insert: {
          id?: string
          is_miting_active?: boolean | null
          show_live_results?: boolean | null
          updated_at?: string | null
          voting_end_time?: string | null
          voting_start_time?: string | null
        }
        Update: {
          id?: string
          is_miting_active?: boolean | null
          show_live_results?: boolean | null
          updated_at?: string | null
          voting_end_time?: string | null
          voting_start_time?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: number
          name: string
          user_id: string
        }
        Insert: {
          id?: number
          name: string
          user_id?: string
        }
        Update: {
          id?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      UserRoles: {
        Row: {
          assigned_at: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "UserRoles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "Roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserRoles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Users: {
        Row: {
          auth_id: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          profile_photo_url: string | null
          updated_at: string | null
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          profile_photo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          profile_photo_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      Votes: {
        Row: {
          candidate_id: string | null
          created_at: string | null
          election_cycle_id: string
          id: string
          is_valid: boolean | null
          position_id: string
          student_id: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string | null
          election_cycle_id: string
          id?: string
          is_valid?: boolean | null
          position_id: string
          student_id: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string | null
          election_cycle_id?: string
          id?: string
          is_valid?: boolean | null
          position_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "Votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "Candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Votes_election_cycle_id_fkey"
            columns: ["election_cycle_id"]
            isOneToOne: false
            referencedRelation: "ElectionCycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Votes_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "Positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Votes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_cycle_id: { Args: never; Returns: string }
      active_election_id: { Args: never; Returns: string }
      admin_lookup_user_id_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      archive_election: { Args: { p_new_label?: string }; Returns: Json }
      cast_vote: {
        Args: { p_candidate_id: string; p_position_id: string }
        Returns: Json
      }
      current_user_id: { Args: never; Returns: string }
      delete_candidate: { Args: { p_candidate_id: string }; Returns: Json }
      get_ballot_positions: { Args: never; Returns: Json }
      get_live_results:
        | {
            Args: never
            Returns: {
              candidate_id: string
              percentage: number
              position_id: string
              position_name: string
            }[]
          }
        | {
            Args: { p_election_id?: string }
            Returns: {
              candidate_id: string
              percentage: number
              position_id: string
              position_name: string
            }[]
          }
      get_vote_tally:
        | {
            Args: never
            Returns: {
              candidate_id: string
              candidate_name: string
              partylist: string
              position_id: string
              position_name: string
              vote_count: number
            }[]
          }
        | {
            Args: { p_election_id?: string }
            Returns: {
              candidate_id: string
              candidate_name: string
              partylist: string
              position_id: string
              position_name: string
              vote_count: number
            }[]
          }
      has_role: { Args: { role_name: string }; Returns: boolean }
      invalidate_vote: { Args: { p_vote_id: string }; Returns: Json }
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
