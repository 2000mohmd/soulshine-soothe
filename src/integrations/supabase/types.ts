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
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          created_at: string
          crisis_severity: string | null
          crisis_triggered: boolean
          duration_seconds: number
          end_reason: string | null
          ended_at: string | null
          estimated_cost_usd: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          started_at: string
          status: string
          summary: string | null
          thread_id: string
          transcript: Json
          turn_count: number
          user_id: string
          voice: string
        }
        Insert: {
          created_at?: string
          crisis_severity?: string | null
          crisis_triggered?: boolean
          duration_seconds?: number
          end_reason?: string | null
          ended_at?: string | null
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          started_at?: string
          status?: string
          summary?: string | null
          thread_id: string
          transcript?: Json
          turn_count?: number
          user_id: string
          voice?: string
        }
        Update: {
          created_at?: string
          crisis_severity?: string | null
          crisis_triggered?: boolean
          duration_seconds?: number
          end_reason?: string | null
          ended_at?: string | null
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          started_at?: string
          status?: string
          summary?: string | null
          thread_id?: string
          transcript?: Json
          turn_count?: number
          user_id?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      care_resources: {
        Row: {
          contact_or_url: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          region: string | null
          resource_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          contact_or_url: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          region?: string | null
          resource_type: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          contact_or_url?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          region?: string | null
          resource_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          content_type: string
          created_at: string
          exercise_slug: string | null
          flagged_crisis: boolean
          id: string
          quick_action: string | null
          sender: Database["public"]["Enums"]["chat_sender"]
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          content_type?: string
          created_at?: string
          exercise_slug?: string | null
          flagged_crisis?: boolean
          id?: string
          quick_action?: string | null
          sender: Database["public"]["Enums"]["chat_sender"]
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          exercise_slug?: string | null
          flagged_crisis?: boolean
          id?: string
          quick_action?: string | null
          sender?: Database["public"]["Enums"]["chat_sender"]
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rate_limits: {
        Row: {
          count: number
          created_at: string
          day_count: number
          day_start: string | null
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          day_count?: number
          day_start?: string | null
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          count?: number
          created_at?: string
          day_count?: number
          day_start?: string | null
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_usage: {
        Row: {
          day: string
          day_input_tokens: number
          day_messages: number
          day_output_tokens: number
          lifetime_input_tokens: number
          lifetime_messages: number
          lifetime_output_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day?: string
          day_input_tokens?: number
          day_messages?: number
          day_output_tokens?: number
          lifetime_input_tokens?: number
          lifetime_messages?: number
          lifetime_output_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          day_input_tokens?: number
          day_messages?: number
          day_output_tokens?: number
          lifetime_input_tokens?: number
          lifetime_messages?: number
          lifetime_output_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string
          due_at: string | null
          exercise_id: string | null
          id: string
          source: Database["public"]["Enums"]["commitment_source"]
          status: Database["public"]["Enums"]["commitment_status"]
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description: string
          due_at?: string | null
          exercise_id?: string | null
          id?: string
          source?: Database["public"]["Enums"]["commitment_source"]
          status?: Database["public"]["Enums"]["commitment_status"]
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string
          due_at?: string | null
          exercise_id?: string | null
          id?: string
          source?: Database["public"]["Enums"]["commitment_source"]
          status?: Database["public"]["Enums"]["commitment_status"]
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      crisis_events: {
        Row: {
          alert_sent_at: string | null
          created_at: string
          escalation_count: number
          escalation_sent_at: string | null
          id: string
          matched_terms: string[]
          message_id: string | null
          notes: string | null
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          source: string
          user_id: string
        }
        Insert: {
          alert_sent_at?: string | null
          created_at?: string
          escalation_count?: number
          escalation_sent_at?: string | null
          id?: string
          matched_terms?: string[]
          message_id?: string | null
          notes?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          source?: string
          user_id: string
        }
        Update: {
          alert_sent_at?: string | null
          created_at?: string
          escalation_count?: number
          escalation_sent_at?: string | null
          id?: string
          matched_terms?: string[]
          message_id?: string | null
          notes?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_prompt_responses: {
        Row: {
          created_at: string
          id: string
          prompt_id: string
          responded_at: string
          response_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt_id: string
          responded_at?: string
          response_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt_id?: string
          responded_at?: string
          response_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_prompt_responses_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "daily_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_prompts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          prompt_text: string
          prompt_type: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          prompt_text: string
          prompt_type?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          prompt_text?: string
          prompt_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      effectiveness_insights: {
        Row: {
          avg_mood_delta: number
          computed_at: string
          confidence: string
          created_at: string
          id: string
          sample_size: number
          subject_key: string
          subject_label: string
          subject_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_mood_delta?: number
          computed_at?: string
          confidence?: string
          created_at?: string
          id?: string
          sample_size?: number
          subject_key: string
          subject_label: string
          subject_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_mood_delta?: number
          computed_at?: string
          confidence?: string
          created_at?: string
          id?: string
          sample_size?: number
          subject_key?: string
          subject_label?: string
          subject_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_completions: {
        Row: {
          completed_at: string
          created_at: string
          exercise_id: string
          id: string
          mood_after: number | null
          mood_before: number | null
          response_data: Json
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          exercise_id: string
          id?: string
          mood_after?: number | null
          mood_before?: number | null
          response_data?: Json
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          exercise_id?: string
          id?: string
          mood_after?: number | null
          mood_before?: number | null
          response_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_completions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          age_mode: string
          category: string
          created_at: string
          estimated_minutes: number
          id: string
          intro_text: string
          slug: string
          sort_order: number
          steps: Json
          title: string
          updated_at: string
        }
        Insert: {
          age_mode?: string
          category: string
          created_at?: string
          estimated_minutes?: number
          id?: string
          intro_text: string
          slug: string
          sort_order?: number
          steps?: Json
          title: string
          updated_at?: string
        }
        Update: {
          age_mode?: string
          category?: string
          created_at?: string
          estimated_minutes?: number
          id?: string
          intro_text?: string
          slug?: string
          sort_order?: number
          steps?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          completed: boolean
          created_at: string
          habit_id: string
          id: string
          log_date: string
          logged_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          habit_id: string
          id?: string
          log_date?: string
          logged_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          habit_id?: string
          id?: string
          log_date?: string
          logged_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          category: string | null
          created_at: string
          frequency_target: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          frequency_target?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          frequency_target?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          dead_lettered: boolean
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          run_after: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dead_lettered?: boolean
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          run_after?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dead_lettered?: boolean
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          run_after?: string
        }
        Relationships: []
      }
      mood_logs: {
        Row: {
          created_at: string
          id: string
          is_baseline: boolean
          logged_at: string
          note: string | null
          score: number
          tags: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_baseline?: boolean
          logged_at?: string
          note?: string | null
          score: number
          tags?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_baseline?: boolean
          logged_at?: string
          note?: string | null
          score?: number
          tags?: string[]
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          id: string
          notification_type: string
          payload: Json
          subject_user_id: string | null
          target_user_id: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          notification_type: string
          payload?: Json
          subject_user_id?: string | null
          target_user_id?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          notification_type?: string
          payload?: Json
          subject_user_id?: string | null
          target_user_id?: string | null
          title?: string
        }
        Relationships: []
      }
      nudges: {
        Row: {
          acted_on: boolean
          created_at: string
          dismissed_at: string | null
          id: string
          message: string
          resource_ids: string[]
          suggested_exercise_slug: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          acted_on?: boolean
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message: string
          resource_ids?: string[]
          suggested_exercise_slug?: string | null
          trigger_type: string
          user_id: string
        }
        Update: {
          acted_on?: boolean
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message?: string
          resource_ids?: string[]
          suggested_exercise_slug?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          age_confirmed_13_plus: boolean
          ai_context_consent: boolean
          consent_accepted_at: string | null
          created_at: string
          date_of_birth: string | null
          id: string
          language: string
          onboarding_completed: boolean
          org_id: string | null
          preferred_name: string | null
          privacy_consent: boolean
          stripe_billing_interval: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          subscription_current_period_end: string | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          timezone: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          age_confirmed_13_plus?: boolean
          ai_context_consent?: boolean
          consent_accepted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          id: string
          language?: string
          onboarding_completed?: boolean
          org_id?: string | null
          preferred_name?: string | null
          privacy_consent?: boolean
          stripe_billing_interval?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_current_period_end?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          age_confirmed_13_plus?: boolean
          ai_context_consent?: boolean
          consent_accepted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          id?: string
          language?: string
          onboarding_completed?: boolean
          org_id?: string | null
          preferred_name?: string | null
          privacy_consent?: boolean
          stripe_billing_interval?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_current_period_end?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      screener_responses: {
        Row: {
          created_at: string
          id: string
          responses: Json
          screener_type: string
          severity: string
          taken_at: string
          total_score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          responses?: Json
          screener_type: string
          severity: string
          taken_at?: string
          total_score: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          responses?: Json
          screener_type?: string
          severity?: string
          taken_at?: string
          total_score?: number
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender: Database["public"]["Enums"]["support_sender"]
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender: Database["public"]["Enums"]["support_sender"]
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender?: Database["public"]["Enums"]["support_sender"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["support_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sweep_state: {
        Row: {
          cursor_value: string | null
          name: string
          updated_at: string
        }
        Insert: {
          cursor_value?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          cursor_value?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      thread_summaries: {
        Row: {
          created_at: string
          id: string
          open_commitment_ids: string[] | null
          summary_text: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          open_commitment_ids?: string[] | null
          summary_text: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          open_commitment_ids?: string[] | null
          summary_text?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_summaries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          communication_preference: string | null
          created_at: string
          existing_diagnosis: string | null
          goals: string[]
          in_professional_care: boolean
          intro_text: string | null
          stressors: string[]
          topics_to_avoid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          communication_preference?: string | null
          created_at?: string
          existing_diagnosis?: string | null
          goals?: string[]
          in_professional_care?: boolean
          intro_text?: string | null
          stressors?: string[]
          topics_to_avoid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          communication_preference?: string | null
          created_at?: string
          existing_diagnosis?: string | null
          goals?: string[]
          in_professional_care?: boolean
          intro_text?: string | null
          stressors?: string[]
          topics_to_avoid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      weekly_digests: {
        Row: {
          created_at: string
          effectiveness_highlights: Json
          exercises_tried: Json
          habits_summary: Json
          id: string
          mood_summary: Json
          narrative_text: string
          previous_focus_followed_up: boolean | null
          screener_summary: Json | null
          suggested_focus: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          effectiveness_highlights?: Json
          exercises_tried?: Json
          habits_summary?: Json
          id?: string
          mood_summary?: Json
          narrative_text: string
          previous_focus_followed_up?: boolean | null
          screener_summary?: Json | null
          suggested_focus?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          effectiveness_highlights?: Json
          exercises_tried?: Json
          habits_summary?: Json
          id?: string
          mood_summary?: Json
          narrative_text?: string
          previous_focus_followed_up?: boolean | null
          screener_summary?: Json | null
          suggested_focus?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          dead_lettered: boolean
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          run_after: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "general" | "condition" | "teen" | "org_member"
      app_role: "user" | "org_admin" | "admin" | "super_admin"
      chat_sender: "user" | "assistant" | "system"
      commitment_source: "chat" | "exercise"
      commitment_status: "pending" | "done" | "skipped"
      subscription_tier: "free" | "pro" | "premium" | "org"
      support_sender: "user" | "admin"
      support_status: "open" | "in_progress" | "resolved"
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
      account_type: ["general", "condition", "teen", "org_member"],
      app_role: ["user", "org_admin", "admin", "super_admin"],
      chat_sender: ["user", "assistant", "system"],
      commitment_source: ["chat", "exercise"],
      commitment_status: ["pending", "done", "skipped"],
      subscription_tier: ["free", "pro", "premium", "org"],
      support_sender: ["user", "admin"],
      support_status: ["open", "in_progress", "resolved"],
    },
  },
} as const
