// =====================================================
// Database Types
// SOURCE: PDF Section 3-4 - Schema Definitions
// =====================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enums from 001_enums.sql
export type LeadTriageStatus = 'New' | 'In Review' | 'Qualified' | 'Nurture' | 'Disqualified' | 'Handed Over'
export type LeadSource = 'Webform (SEM)' | 'Webform (Organic)' | 'Instagram' | 'TikTok' | 'Facebook' | 'Event' | 'Referral' | 'Outbound' | 'Lainnya'
export type OpportunityStage = 'Prospecting' | 'Discovery' | 'Quote Sent' | 'Negotiation' | 'Closed Won' | 'Closed Lost' | 'On Hold'
export type ActivityStatus = 'Planned' | 'Done' | 'Cancelled'
export type ActivityTypeV2 = 'Call' | 'Email' | 'Meeting' | 'Site Visit' | 'WhatsApp' | 'Task' | 'Proposal' | 'Contract Review'
export type CadenceEnrollmentStatus = 'Active' | 'Paused' | 'Completed' | 'Stopped'
export type ProspectingTargetStatus = 'new' | 'researching' | 'outreach_planned' | 'contacted' | 'meeting_scheduled' | 'converted' | 'dropped'
export type UserRole =
  | 'Director'
  | 'super admin'
  | 'Marketing Manager'
  | 'Marcomm'
  | 'DGO'
  | 'MACX'
  | 'VSDO'
  | 'sales manager'
  | 'salesperson'
  | 'sales support'
  | 'EXIM Ops'
  | 'domestics Ops'
  | 'Import DTD Ops'
  | 'traffic & warehous'
  | 'finance'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          email: string
          name: string
          role: UserRole
          department: string | null
          is_active: boolean
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          email: string
          name: string
          role: UserRole
          department?: string | null
          is_active?: boolean
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          name?: string
          role?: UserRole
          department?: string | null
          is_active?: boolean
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      accounts: {
        Row: {
          account_id: string
          company_name: string
          pic_name: string | null
          pic_email: string | null
          pic_phone: string | null
          industry: string | null
          address: string | null
          city: string | null
          province: string | null
          country: string | null
          website: string | null
          employee_count: string | null
          annual_revenue: string | null
          notes: string | null
          tags: string[] | null
          owner_user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          dedupe_key: string | null
        }
        Insert: {
          account_id?: string
          company_name: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          address?: string | null
          city?: string | null
          province?: string | null
          country?: string | null
          website?: string | null
          employee_count?: string | null
          annual_revenue?: string | null
          notes?: string | null
          tags?: string[] | null
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
        Update: {
          account_id?: string
          company_name?: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          address?: string | null
          city?: string | null
          province?: string | null
          country?: string | null
          website?: string | null
          employee_count?: string | null
          annual_revenue?: string | null
          notes?: string | null
          tags?: string[] | null
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
      }
      contacts: {
        Row: {
          contact_id: string
          account_id: string | null
          first_name: string
          last_name: string | null
          email: string | null
          phone: string | null
          job_title: string | null
          department: string | null
          is_primary: boolean
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          dedupe_key: string | null
        }
        Insert: {
          contact_id?: string
          account_id?: string | null
          first_name: string
          last_name?: string | null
          email?: string | null
          phone?: string | null
          job_title?: string | null
          department?: string | null
          is_primary?: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
        Update: {
          contact_id?: string
          account_id?: string | null
          first_name?: string
          last_name?: string | null
          email?: string | null
          phone?: string | null
          job_title?: string | null
          department?: string | null
          is_primary?: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
      }
      leads: {
        Row: {
          lead_id: string
          company_name: string
          pic_name: string | null
          pic_email: string | null
          pic_phone: string | null
          industry: string | null
          source: LeadSource
          source_detail: string | null
          triage_status: LeadTriageStatus
          priority: number
          inquiry_text: string | null
          disqualification_reason: string | null
          disqualified_at: string | null
          handover_eligible: boolean
          claimed_at: string | null
          marketing_owner_user_id: string | null
          sales_owner_user_id: string | null
          customer_id: string | null
          opportunity_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          dedupe_key: string | null
        }
        Insert: {
          lead_id?: string
          company_name: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          source?: LeadSource
          source_detail?: string | null
          triage_status?: LeadTriageStatus
          priority?: number
          inquiry_text?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          handover_eligible?: boolean
          claimed_at?: string | null
          marketing_owner_user_id?: string | null
          sales_owner_user_id?: string | null
          customer_id?: string | null
          opportunity_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
        Update: {
          lead_id?: string
          company_name?: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          source?: LeadSource
          source_detail?: string | null
          triage_status?: LeadTriageStatus
          priority?: number
          inquiry_text?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          handover_eligible?: boolean
          claimed_at?: string | null
          marketing_owner_user_id?: string | null
          sales_owner_user_id?: string | null
          customer_id?: string | null
          opportunity_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          dedupe_key?: string | null
        }
      }
      lead_handover_pool: {
        Row: {
          pool_id: number
          lead_id: string
          handed_over_by: string | null
          handed_over_at: string
          handover_notes: string | null
          priority: number
          expires_at: string | null
          claimed_by: string | null
          claimed_at: string | null
        }
        Insert: {
          pool_id?: number
          lead_id: string
          handed_over_by?: string | null
          handed_over_at?: string
          handover_notes?: string | null
          priority?: number
          expires_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
        }
        Update: {
          pool_id?: number
          lead_id?: string
          handed_over_by?: string | null
          handed_over_at?: string
          handover_notes?: string | null
          priority?: number
          expires_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
        }
      }
      opportunities: {
        Row: {
          opportunity_id: string
          name: string
          account_id: string
          lead_id: string | null
          stage: OpportunityStage
          estimated_value: number | null
          currency: string
          probability: number | null
          expected_close_date: string | null
          next_step: string | null
          next_step_due_date: string | null
          close_reason: string | null
          closed_at: string | null
          notes: string | null
          owner_user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          opportunity_id?: string
          name: string
          account_id: string
          lead_id?: string | null
          stage?: OpportunityStage
          estimated_value?: number | null
          currency?: string
          probability?: number | null
          expected_close_date?: string | null
          next_step?: string | null
          next_step_due_date?: string | null
          close_reason?: string | null
          closed_at?: string | null
          notes?: string | null
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          opportunity_id?: string
          name?: string
          account_id?: string
          lead_id?: string | null
          stage?: OpportunityStage
          estimated_value?: number | null
          currency?: string
          probability?: number | null
          expected_close_date?: string | null
          next_step?: string | null
          next_step_due_date?: string | null
          close_reason?: string | null
          closed_at?: string | null
          notes?: string | null
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      opportunity_stage_history: {
        Row: {
          history_id: number
          opportunity_id: string
          old_stage: OpportunityStage | null
          new_stage: OpportunityStage
          changed_by: string | null
          changed_at: string
          notes: string | null
        }
        Insert: {
          history_id?: number
          opportunity_id: string
          old_stage?: OpportunityStage | null
          new_stage: OpportunityStage
          changed_by?: string | null
          changed_at?: string
          notes?: string | null
        }
        Update: {
          history_id?: number
          opportunity_id?: string
          old_stage?: OpportunityStage | null
          new_stage?: OpportunityStage
          changed_by?: string | null
          changed_at?: string
          notes?: string | null
        }
      }
      activities: {
        Row: {
          activity_id: string
          activity_type: ActivityTypeV2
          subject: string
          description: string | null
          outcome: string | null
          status: ActivityStatus
          due_date: string
          due_time: string | null
          completed_at: string | null
          related_account_id: string | null
          related_contact_id: string | null
          related_opportunity_id: string | null
          related_lead_id: string | null
          related_target_id: string | null
          cadence_enrollment_id: number | null
          cadence_step_number: number | null
          owner_user_id: string
          assigned_to: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          activity_id?: string
          activity_type?: ActivityTypeV2
          subject: string
          description?: string | null
          outcome?: string | null
          status?: ActivityStatus
          due_date: string
          due_time?: string | null
          completed_at?: string | null
          related_account_id?: string | null
          related_contact_id?: string | null
          related_opportunity_id?: string | null
          related_lead_id?: string | null
          related_target_id?: string | null
          cadence_enrollment_id?: number | null
          cadence_step_number?: number | null
          owner_user_id: string
          assigned_to?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          activity_type?: ActivityTypeV2
          subject?: string
          description?: string | null
          outcome?: string | null
          status?: ActivityStatus
          due_date?: string
          due_time?: string | null
          completed_at?: string | null
          related_account_id?: string | null
          related_contact_id?: string | null
          related_opportunity_id?: string | null
          related_lead_id?: string | null
          related_target_id?: string | null
          cadence_enrollment_id?: number | null
          cadence_step_number?: number | null
          owner_user_id?: string
          assigned_to?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cadences: {
        Row: {
          cadence_id: number
          name: string
          description: string | null
          is_active: boolean
          owner_user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          cadence_id?: number
          name: string
          description?: string | null
          is_active?: boolean
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          cadence_id?: number
          name?: string
          description?: string | null
          is_active?: boolean
          owner_user_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cadence_steps: {
        Row: {
          step_id: number
          cadence_id: number
          step_number: number
          activity_type: ActivityTypeV2
          subject_template: string
          description_template: string | null
          delay_days: number
          created_at: string
        }
        Insert: {
          step_id?: number
          cadence_id: number
          step_number: number
          activity_type: ActivityTypeV2
          subject_template: string
          description_template?: string | null
          delay_days?: number
          created_at?: string
        }
        Update: {
          step_id?: number
          cadence_id?: number
          step_number?: number
          activity_type?: ActivityTypeV2
          subject_template?: string
          description_template?: string | null
          delay_days?: number
          created_at?: string
        }
      }
      cadence_enrollments: {
        Row: {
          enrollment_id: number
          cadence_id: number
          account_id: string | null
          contact_id: string | null
          opportunity_id: string | null
          target_id: string | null
          current_step: number
          status: CadenceEnrollmentStatus
          enrolled_by: string | null
          enrolled_at: string
          completed_at: string | null
          stopped_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          enrollment_id?: number
          cadence_id: number
          account_id?: string | null
          contact_id?: string | null
          opportunity_id?: string | null
          target_id?: string | null
          current_step?: number
          status?: CadenceEnrollmentStatus
          enrolled_by?: string | null
          enrolled_at?: string
          completed_at?: string | null
          stopped_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          enrollment_id?: number
          cadence_id?: number
          account_id?: string | null
          contact_id?: string | null
          opportunity_id?: string | null
          target_id?: string | null
          current_step?: number
          status?: CadenceEnrollmentStatus
          enrolled_by?: string | null
          enrolled_at?: string
          completed_at?: string | null
          stopped_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      prospecting_targets: {
        Row: {
          target_id: string
          company_name: string
          pic_name: string | null
          pic_email: string | null
          pic_phone: string | null
          industry: string | null
          source: string | null
          status: ProspectingTargetStatus
          notes: string | null
          owner_user_id: string | null
          converted_account_id: string | null
          converted_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          target_id?: string
          company_name: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          source?: string | null
          status?: ProspectingTargetStatus
          notes?: string | null
          owner_user_id?: string | null
          converted_account_id?: string | null
          converted_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          target_id?: string
          company_name?: string
          pic_name?: string | null
          pic_email?: string | null
          pic_phone?: string | null
          industry?: string | null
          source?: string | null
          status?: ProspectingTargetStatus
          notes?: string | null
          owner_user_id?: string | null
          converted_account_id?: string | null
          converted_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      import_batches: {
        Row: {
          batch_id: number
          entity_type: string
          file_name: string | null
          total_rows: number
          success_count: number
          error_count: number
          status: string
          error_details: Json | null
          imported_by: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          batch_id?: number
          entity_type: string
          file_name?: string | null
          total_rows?: number
          success_count?: number
          error_count?: number
          status?: string
          error_details?: Json | null
          imported_by?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          batch_id?: number
          entity_type?: string
          file_name?: string | null
          total_rows?: number
          success_count?: number
          error_count?: number
          status?: string
          error_details?: Json | null
          imported_by?: string | null
          started_at?: string
          completed_at?: string | null
        }
      }
      audit_logs: {
        Row: {
          log_id: number
          entity_type: string
          entity_id: string
          action: string
          actor_user_id: string | null
          details: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          log_id?: number
          entity_type: string
          entity_id: string
          action: string
          actor_user_id?: string | null
          details?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          log_id?: number
          entity_type?: string
          entity_id?: string
          action?: string
          actor_user_id?: string | null
          details?: Json | null
          ip_address?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      v_lead_inbox: {
        Row: {
          lead_id: string
          company_name: string
          pic_name: string | null
          pic_email: string | null
          triage_status: LeadTriageStatus
          source: LeadSource
          priority: number
          marketing_owner_name: string | null
          marketing_owner_email: string | null
          created_at: string
        }
      }
      v_sales_inbox: {
        Row: {
          lead_id: string
          company_name: string
          pic_name: string | null
          pool_id: number
          handed_over_at: string
          handover_notes: string | null
          priority: number
          expires_at: string | null
          handed_over_by_name: string | null
        }
      }
      v_my_leads: {
        Row: {
          lead_id: string
          company_name: string
          sales_owner_user_id: string
          account_name: string | null
          linked_opportunity_id: string | null
          opportunity_stage: OpportunityStage | null
          claimed_at: string | null
        }
      }
      v_pipeline_active: {
        Row: {
          opportunity_id: string
          name: string
          stage: OpportunityStage
          estimated_value: number | null
          account_name: string
          owner_name: string | null
          next_step_due_date: string | null
          is_overdue: boolean
        }
      }
      v_accounts_enriched: {
        Row: {
          account_id: string
          company_name: string
          owner_name: string | null
          open_opportunities: number
          pipeline_value: number
          contact_count: number
          planned_activities: number
          overdue_activities: number
        }
      }
    }
    Functions: {
      rpc_lead_triage: {
        Args: {
          p_lead_id: string
          p_new_status: LeadTriageStatus
          p_notes?: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_lead_handover_to_sales_pool: {
        Args: {
          p_lead_id: string
          p_notes?: string
          p_priority?: number
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_sales_claim_lead: {
        Args: {
          p_pool_id: number
          p_create_account?: boolean
          p_create_opportunity?: boolean
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_lead_convert: {
        Args: {
          p_lead_id: string
          p_opportunity_name: string
          p_estimated_value?: number
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_opportunity_change_stage: {
        Args: {
          p_opportunity_id: string
          p_new_stage: OpportunityStage
          p_notes?: string
          p_close_reason?: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_target_convert: {
        Args: {
          p_target_id: string
          p_create_opportunity?: boolean
          p_opportunity_name?: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      rpc_activity_complete_and_next: {
        Args: {
          p_activity_id: string
          p_outcome?: string
          p_create_follow_up?: boolean
          p_follow_up_days?: number
          p_follow_up_type?: ActivityTypeV2
          p_follow_up_subject?: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
    }
    Enums: {
      lead_triage_status: LeadTriageStatus
      lead_source: LeadSource
      opportunity_stage: OpportunityStage
      activity_status: ActivityStatus
      activity_type_v2: ActivityTypeV2
      cadence_enrollment_status: CadenceEnrollmentStatus
      prospecting_target_status: ProspectingTargetStatus
      user_role: UserRole
    }
  }
}
