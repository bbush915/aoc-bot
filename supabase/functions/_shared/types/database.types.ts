export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      completions: {
        Row: {
          aoc_id: string
          created_at: string
          day: number
          event: string
          id: number
          part_1_timestamp: number
          part_2_timestamp: number | null
          updated_at: string
        }
        Insert: {
          aoc_id: string
          created_at?: string
          day: number
          event: string
          id?: number
          part_1_timestamp: number
          part_2_timestamp?: number | null
          updated_at?: string
        }
        Update: {
          aoc_id?: string
          created_at?: string
          day?: number
          event?: string
          id?: number
          part_1_timestamp?: number
          part_2_timestamp?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      event_participants: {
        Row: {
          ai_usage: string
          created_at: string
          division: string
          event: string
          id: number
          participant_id: number
          updated_at: string
        }
        Insert: {
          ai_usage: string
          created_at?: string
          division: string
          event: string
          id?: number
          participant_id: number
          updated_at?: string
        }
        Update: {
          ai_usage?: string
          created_at?: string
          division?: string
          event?: string
          id?: number
          participant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_participants: {
        Row: {
          aoc_id: string
          created_at: string
          event: string
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          aoc_id: string
          created_at?: string
          event: string
          id?: number
          name: string
          updated_at?: string
        }
        Update: {
          aoc_id?: string
          created_at?: string
          event?: string
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          aoc_id: string
          created_at: string
          id: number
          slack_id: string
          updated_at: string
        }
        Insert: {
          aoc_id: string
          created_at?: string
          id?: number
          slack_id: string
          updated_at?: string
        }
        Update: {
          aoc_id?: string
          created_at?: string
          id?: number
          slack_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      start_timestamp_overrides: {
        Row: {
          created_at: string
          day: number
          event: string
          id: number
          participant_id: number
          start_timestamp: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day: number
          event: string
          id?: number
          participant_id: number
          start_timestamp: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: number
          event?: string
          id?: number
          participant_id?: number
          start_timestamp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "start_timestamp_overrides_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_daily_leaderboard: {
        Args: {
          p_event: string
          p_day: string
        }
        Returns: {
          aoc_id: string
          rank: number
          competitive_rank: number
          raw_name: string
          name: string
          is_competitive: boolean
          part_1_duration: number
          part_2_duration: number
          total_duration: number
          daily_stars: number
          total_stars: number
        }[]
      }
      get_overall_leaderboard: {
        Args: {
          p_event: string
          p_day: string
        }
        Returns: {
          aoc_id: string
          rank: number
          raw_name: string
          name: string
          is_competitive: boolean
          total_stars: number
          total_duration: number
        }[]
      }
      sync_leaderboard: {
        Args: {
          p_event: string
        }
        Returns: undefined
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
