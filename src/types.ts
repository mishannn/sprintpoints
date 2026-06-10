export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Tables = Database["public"]["Tables"];
export type Room = Tables["rooms"]["Row"];
export type Participant = Tables["participants"]["Row"];
export type Issue = Tables["issues"]["Row"];
export type Vote = Tables["votes"]["Row"];

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          code: string;
          name: string;
          host_token: string;
          card_set: string[];
          revealed: boolean;
          active_issue_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          name: string;
          host_token: string;
          card_set?: string[];
          revealed?: boolean;
          active_issue_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          host_token?: string;
          card_set?: string[];
          revealed?: boolean;
          active_issue_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      participants: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          token: string;
          is_spectator: boolean;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
          token: string;
          is_spectator?: boolean;
          last_seen_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          name?: string;
          token?: string;
          is_spectator?: boolean;
          last_seen_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      issues: {
        Row: {
          id: string;
          room_id: string;
          title: string;
          position: number;
          estimate: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          title: string;
          position?: number;
          estimate?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          title?: string;
          position?: number;
          estimate?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "issues_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      votes: {
        Row: {
          id: string;
          room_id: string;
          issue_id: string;
          participant_id: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          issue_id: string;
          participant_id: string;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          issue_id?: string;
          participant_id?: string;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "votes_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
