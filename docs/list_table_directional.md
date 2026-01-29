| table_schema       | table_name                               | column_name                              | data_type                   | is_nullable | character_maximum_length |
| ------------------ | ---------------------------------------- | ---------------------------------------- | --------------------------- | ----------- | ------------------------ |
| auth               | audit_log_entries                        | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | flow_state                               | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | identities                               | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | instances                                | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | mfa_amr_claims                           | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | mfa_challenges                           | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | mfa_factors                              | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | oauth_authorizations                     | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | oauth_client_states                      | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | oauth_clients                            | created_at                               | timestamp with time zone    | NO          | null                     |
| auth               | one_time_tokens                          | created_at                               | timestamp without time zone | NO          | null                     |
| auth               | refresh_tokens                           | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | saml_providers                           | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | saml_relay_states                        | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | sessions                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | sso_domains                              | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | sso_providers                            | created_at                               | timestamp with time zone    | YES         | null                     |
| auth               | users                                    | created_at                               | timestamp with time zone    | YES         | null                     |
| information_schema | routines                                 | created                                  | timestamp with time zone    | YES         | null                     |
| information_schema | triggers                                 | created                                  | timestamp with time zone    | YES         | null                     |
| pg_catalog         | pg_authid                                | rolcreatedb                              | boolean                     | NO          | null                     |
| pg_catalog         | pg_proc                                  | procost                                  | real                        | NO          | null                     |
| pg_catalog         | pg_roles                                 | rolcreatedb                              | boolean                     | YES         | null                     |
| pg_catalog         | pg_shadow                                | usecreatedb                              | boolean                     | YES         | null                     |
| pg_catalog         | pg_stat_activity                         | leader_pid                               | integer                     | YES         | null                     |
| pg_catalog         | pg_stat_subscription                     | leader_pid                               | integer                     | YES         | null                     |
| pg_catalog         | pg_user                                  | usecreatedb                              | boolean                     | YES         | null                     |
| public             | accounts                                 | account_id                               | text                        | NO          | null                     |
| public             | accounts                                 | company_name                             | text                        | NO          | null                     |
| public             | accounts                                 | domain                                   | text                        | YES         | null                     |
| public             | accounts                                 | npwp                                     | text                        | YES         | null                     |
| public             | accounts                                 | industry                                 | text                        | YES         | null                     |
| public             | accounts                                 | address                                  | text                        | YES         | null                     |
| public             | accounts                                 | city                                     | text                        | YES         | null                     |
| public             | accounts                                 | province                                 | text                        | YES         | null                     |
| public             | accounts                                 | country                                  | text                        | YES         | null                     |
| public             | accounts                                 | postal_code                              | text                        | YES         | null                     |
| public             | accounts                                 | phone                                    | text                        | YES         | null                     |
| public             | accounts                                 | pic_name                                 | text                        | YES         | null                     |
| public             | accounts                                 | pic_email                                | text                        | YES         | null                     |
| public             | accounts                                 | pic_phone                                | text                        | YES         | null                     |
| public             | accounts                                 | owner_user_id                            | uuid                        | YES         | null                     |
| public             | accounts                                 | tenure_status                            | USER-DEFINED                | YES         | null                     |
| public             | accounts                                 | activity_status                          | USER-DEFINED                | YES         | null                     |
| public             | accounts                                 | first_deal_date                          | timestamp with time zone    | YES         | null                     |
| public             | accounts                                 | last_transaction_date                    | timestamp with time zone    | YES         | null                     |
| public             | accounts                                 | is_active                                | boolean                     | YES         | null                     |
| public             | accounts                                 | tags                                     | ARRAY                       | YES         | null                     |
| public             | accounts                                 | notes                                    | text                        | YES         | null                     |
| public             | accounts                                 | dedupe_key                               | text                        | YES         | null                     |
| public             | accounts                                 | created_by                               | uuid                        | YES         | null                     |
| public             | accounts                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | accounts                                 | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | accounts                                 | account_status                           | USER-DEFINED                | YES         | null                     |
| public             | accounts                                 | first_transaction_date                   | timestamp with time zone    | YES         | null                     |
| public             | accounts                                 | lead_id                                  | text                        | YES         | null                     |
| public             | accounts                                 | retry_count                              | integer                     | YES         | null                     |
| public             | accounts                                 | original_lead_id                         | text                        | YES         | null                     |
| public             | accounts                                 | original_creator_id                      | uuid                        | YES         | null                     |
| public             | activities                               | related_account_id                       | text                        | YES         | null                     |
| public             | activities                               | related_opportunity_id                   | text                        | YES         | null                     |
| public             | activities                               | related_lead_id                          | text                        | YES         | null                     |
| public             | activities                               | created_by                               | uuid                        | YES         | null                     |
| public             | activities                               | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | audit_logs                               | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | cadence_enrollments                      | account_id                               | text                        | YES         | null                     |
| public             | cadence_enrollments                      | opportunity_id                           | text                        | YES         | null                     |
| public             | cadence_enrollments                      | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | cadence_steps                            | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | cadences                                 | created_by                               | uuid                        | YES         | null                     |
| public             | cadences                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | contacts                                 | account_id                               | text                        | NO          | null                     |
| public             | contacts                                 | created_by                               | uuid                        | YES         | null                     |
| public             | contacts                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | crm_idempotency                          | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | crm_notification_logs                    | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | customer_quotation_items                 | id                                       | uuid                        | NO          | null                     |
| public             | customer_quotation_items                 | quotation_id                             | uuid                        | NO          | null                     |
| public             | customer_quotation_items                 | component_type                           | USER-DEFINED                | NO          | null                     |
| public             | customer_quotation_items                 | component_name                           | character varying           | YES         | 255                      |
| public             | customer_quotation_items                 | description                              | text                        | YES         | null                     |
| public             | customer_quotation_items                 | cost_amount                              | numeric                     | NO          | null                     |
| public             | customer_quotation_items                 | target_margin_percent                    | numeric                     | YES         | null                     |
| public             | customer_quotation_items                 | selling_rate                             | numeric                     | NO          | null                     |
| public             | customer_quotation_items                 | unit_price                               | numeric                     | YES         | null                     |
| public             | customer_quotation_items                 | quantity                                 | numeric                     | YES         | null                     |
| public             | customer_quotation_items                 | unit                                     | character varying           | YES         | 50                       |
| public             | customer_quotation_items                 | sort_order                               | integer                     | YES         | null                     |
| public             | customer_quotation_items                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | customer_quotation_items                 | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | customer_quotation_sequences             | year                                     | integer                     | NO          | null                     |
| public             | customer_quotation_sequences             | month                                    | integer                     | NO          | null                     |
| public             | customer_quotation_sequences             | last_sequence                            | integer                     | YES         | null                     |
| public             | customer_quotations                      | id                                       | uuid                        | NO          | null                     |
| public             | customer_quotations                      | ticket_id                                | uuid                        | YES         | null                     |
| public             | customer_quotations                      | operational_cost_id                      | uuid                        | YES         | null                     |
| public             | customer_quotations                      | quotation_number                         | character varying           | NO          | 50                       |
| public             | customer_quotations                      | customer_name                            | character varying           | NO          | 255                      |
| public             | customer_quotations                      | customer_company                         | character varying           | YES         | 255                      |
| public             | customer_quotations                      | customer_email                           | character varying           | YES         | 255                      |
| public             | customer_quotations                      | customer_phone                           | character varying           | YES         | 50                       |
| public             | customer_quotations                      | customer_address                         | text                        | YES         | null                     |
| public             | customer_quotations                      | service_type                             | character varying           | YES         | 100                      |
| public             | customer_quotations                      | service_type_code                        | character varying           | YES         | 100                      |
| public             | customer_quotations                      | fleet_type                               | character varying           | YES         | 100                      |
| public             | customer_quotations                      | fleet_quantity                           | integer                     | YES         | null                     |
| public             | customer_quotations                      | incoterm                                 | character varying           | YES         | 20                       |
| public             | customer_quotations                      | commodity                                | character varying           | YES         | 255                      |
| public             | customer_quotations                      | cargo_description                        | text                        | YES         | null                     |
| public             | customer_quotations                      | cargo_weight                             | numeric                     | YES         | null                     |
| public             | customer_quotations                      | cargo_weight_unit                        | character varying           | YES         | 10                       |
| public             | customer_quotations                      | cargo_volume                             | numeric                     | YES         | null                     |
| public             | customer_quotations                      | cargo_volume_unit                        | character varying           | YES         | 10                       |
| public             | customer_quotations                      | cargo_quantity                           | integer                     | YES         | null                     |
| public             | customer_quotations                      | cargo_quantity_unit                      | character varying           | YES         | 50                       |
| public             | customer_quotations                      | origin_address                           | text                        | YES         | null                     |
| public             | customer_quotations                      | origin_city                              | character varying           | YES         | 100                      |
| public             | customer_quotations                      | origin_country                           | character varying           | YES         | 100                      |
| public             | customer_quotations                      | origin_port                              | character varying           | YES         | 100                      |
| public             | customer_quotations                      | destination_address                      | text                        | YES         | null                     |
| public             | customer_quotations                      | destination_city                         | character varying           | YES         | 100                      |
| public             | customer_quotations                      | destination_country                      | character varying           | YES         | 100                      |
| public             | customer_quotations                      | destination_port                         | character varying           | YES         | 100                      |
| public             | customer_quotations                      | rate_structure                           | USER-DEFINED                | NO          | null                     |
| public             | customer_quotations                      | total_cost                               | numeric                     | YES         | null                     |
| public             | customer_quotations                      | target_margin_percent                    | numeric                     | YES         | null                     |
| public             | customer_quotations                      | total_selling_rate                       | numeric                     | YES         | null                     |
| public             | customer_quotations                      | currency                                 | character varying           | YES         | 3                        |
| public             | customer_quotations                      | scope_of_work                            | text                        | YES         | null                     |
| public             | customer_quotations                      | terms_includes                           | jsonb                       | YES         | null                     |
| public             | customer_quotations                      | terms_excludes                           | jsonb                       | YES         | null                     |
| public             | customer_quotations                      | terms_notes                              | text                        | YES         | null                     |
| public             | customer_quotations                      | validity_days                            | integer                     | YES         | null                     |
| public             | customer_quotations                      | valid_until                              | date                        | YES         | null                     |
| public             | customer_quotations                      | status                                   | USER-DEFINED                | YES         | null                     |
| public             | customer_quotations                      | pdf_url                                  | text                        | YES         | null                     |
| public             | customer_quotations                      | pdf_generated_at                         | timestamp with time zone    | YES         | null                     |
| public             | customer_quotations                      | sent_via                                 | character varying           | YES         | 20                       |
| public             | customer_quotations                      | sent_at                                  | timestamp with time zone    | YES         | null                     |
| public             | customer_quotations                      | sent_to                                  | character varying           | YES         | 255                      |
| public             | customer_quotations                      | validation_code                          | uuid                        | YES         | null                     |
| public             | customer_quotations                      | created_by                               | uuid                        | NO          | null                     |
| public             | customer_quotations                      | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | customer_quotations                      | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | customer_quotations                      | estimated_leadtime                       | text                        | YES         | null                     |
| public             | customer_quotations                      | estimated_cargo_value                    | numeric                     | YES         | null                     |
| public             | customer_quotations                      | cargo_value_currency                     | text                        | YES         | null                     |
| public             | customer_quotations                      | lead_id                                  | text                        | YES         | null                     |
| public             | customer_quotations                      | opportunity_id                           | text                        | YES         | null                     |
| public             | customer_quotations                      | sequence_number                          | integer                     | YES         | null                     |
| public             | customer_quotations                      | source_type                              | character varying           | YES         | 20                       |
| public             | customer_quotations                      | rejection_reason                         | text                        | YES         | null                     |
| public             | customer_quotations                      | source_rate_quote_id                     | uuid                        | YES         | null                     |
| public             | import_batches                           | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | insights_growth                          | created_at                               | timestamp with time zone    | NO          | null                     |
| public             | lead_handover_pool                       | pool_id                                  | bigint                      | NO          | null                     |
| public             | lead_handover_pool                       | lead_id                                  | text                        | NO          | null                     |
| public             | lead_handover_pool                       | handed_over_by                           | uuid                        | NO          | null                     |
| public             | lead_handover_pool                       | handed_over_at                           | timestamp with time zone    | YES         | null                     |
| public             | lead_handover_pool                       | handover_notes                           | text                        | YES         | null                     |
| public             | lead_handover_pool                       | priority                                 | integer                     | YES         | null                     |
| public             | lead_handover_pool                       | claimed_by                               | uuid                        | YES         | null                     |
| public             | lead_handover_pool                       | claimed_at                               | timestamp with time zone    | YES         | null                     |
| public             | lead_handover_pool                       | expires_at                               | timestamp with time zone    | YES         | null                     |
| public             | lead_handover_pool                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | lead_id                                  | text                        | NO          | null                     |
| public             | leads                                    | company_name                             | text                        | NO          | null                     |
| public             | leads                                    | contact_name                             | text                        | YES         | null                     |
| public             | leads                                    | contact_email                            | text                        | YES         | null                     |
| public             | leads                                    | contact_phone                            | text                        | YES         | null                     |
| public             | leads                                    | contact_mobile                           | text                        | YES         | null                     |
| public             | leads                                    | job_title                                | text                        | YES         | null                     |
| public             | leads                                    | source                                   | text                        | YES         | null                     |
| public             | leads                                    | source_detail                            | text                        | YES         | null                     |
| public             | leads                                    | service_code                             | text                        | YES         | null                     |
| public             | leads                                    | service_description                      | text                        | YES         | null                     |
| public             | leads                                    | route                                    | text                        | YES         | null                     |
| public             | leads                                    | origin                                   | text                        | YES         | null                     |
| public             | leads                                    | destination                              | text                        | YES         | null                     |
| public             | leads                                    | volume_estimate                          | text                        | YES         | null                     |
| public             | leads                                    | timeline                                 | text                        | YES         | null                     |
| public             | leads                                    | notes                                    | text                        | YES         | null                     |
| public             | leads                                    | triage_status                            | USER-DEFINED                | NO          | null                     |
| public             | leads                                    | status                                   | USER-DEFINED                | YES         | null                     |
| public             | leads                                    | handover_eligible                        | boolean                     | YES         | null                     |
| public             | leads                                    | marketing_owner_user_id                  | uuid                        | YES         | null                     |
| public             | leads                                    | sales_owner_user_id                      | uuid                        | YES         | null                     |
| public             | leads                                    | opportunity_id                           | text                        | YES         | null                     |
| public             | leads                                    | customer_id                              | text                        | YES         | null                     |
| public             | leads                                    | qualified_at                             | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | disqualified_at                          | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | disqualified_reason                      | text                        | YES         | null                     |
| public             | leads                                    | handed_over_at                           | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | claimed_at                               | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | converted_at                             | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | dedupe_key                               | text                        | YES         | null                     |
| public             | leads                                    | created_by                               | uuid                        | YES         | null                     |
| public             | leads                                    | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | leads                                    | priority                                 | integer                     | YES         | null                     |
| public             | leads                                    | industry                                 | text                        | YES         | null                     |
| public             | leads                                    | potential_revenue                        | numeric                     | YES         | null                     |
| public             | leads                                    | claim_status                             | USER-DEFINED                | YES         | null                     |
| public             | leads                                    | claimed_by_name                          | text                        | YES         | null                     |
| public             | leads                                    | account_id                               | text                        | YES         | null                     |
| public             | leads                                    | quotation_status                         | character varying           | YES         | 50                       |
| public             | leads                                    | latest_quotation_id                      | uuid                        | YES         | null                     |
| public             | leads                                    | quotation_count                          | integer                     | YES         | null                     |
| public             | operational_cost_rejection_reasons       | id                                       | uuid                        | NO          | null                     |
| public             | operational_cost_rejection_reasons       | operational_cost_id                      | uuid                        | NO          | null                     |
| public             | operational_cost_rejection_reasons       | reason_type                              | USER-DEFINED                | NO          | null                     |
| public             | operational_cost_rejection_reasons       | suggested_amount                         | numeric                     | YES         | null                     |
| public             | operational_cost_rejection_reasons       | currency                                 | character varying           | YES         | 3                        |
| public             | operational_cost_rejection_reasons       | notes                                    | text                        | YES         | null                     |
| public             | operational_cost_rejection_reasons       | created_by                               | uuid                        | NO          | null                     |
| public             | operational_cost_rejection_reasons       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | operational_cost_rejection_reasons       | competitor_name                          | text                        | YES         | null                     |
| public             | operational_cost_rejection_reasons       | competitor_amount                        | numeric                     | YES         | null                     |
| public             | operational_cost_rejection_reasons       | customer_budget                          | numeric                     | YES         | null                     |
| public             | opportunities                            | opportunity_id                           | text                        | NO          | null                     |
| public             | opportunities                            | account_id                               | text                        | NO          | null                     |
| public             | opportunities                            | primary_contact_id                       | text                        | YES         | null                     |
| public             | opportunities                            | source_lead_id                           | text                        | YES         | null                     |
| public             | opportunities                            | name                                     | text                        | NO          | null                     |
| public             | opportunities                            | description                              | text                        | YES         | null                     |
| public             | opportunities                            | service_codes                            | ARRAY                       | YES         | null                     |
| public             | opportunities                            | route                                    | text                        | YES         | null                     |
| public             | opportunities                            | origin                                   | text                        | YES         | null                     |
| public             | opportunities                            | destination                              | text                        | YES         | null                     |
| public             | opportunities                            | estimated_value                          | numeric                     | YES         | null                     |
| public             | opportunities                            | currency                                 | text                        | YES         | null                     |
| public             | opportunities                            | probability                              | integer                     | YES         | null                     |
| public             | opportunities                            | stage                                    | USER-DEFINED                | NO          | null                     |
| public             | opportunities                            | next_step                                | text                        | NO          | null                     |
| public             | opportunities                            | next_step_due_date                       | date                        | NO          | null                     |
| public             | opportunities                            | owner_user_id                            | uuid                        | NO          | null                     |
| public             | opportunities                            | closed_at                                | timestamp with time zone    | YES         | null                     |
| public             | opportunities                            | outcome                                  | text                        | YES         | null                     |
| public             | opportunities                            | lost_reason                              | text                        | YES         | null                     |
| public             | opportunities                            | competitor                               | text                        | YES         | null                     |
| public             | opportunities                            | created_by                               | uuid                        | YES         | null                     |
| public             | opportunities                            | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | opportunities                            | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | opportunities                            | competitor_price                         | numeric                     | YES         | null                     |
| public             | opportunities                            | customer_budget                          | numeric                     | YES         | null                     |
| public             | opportunities                            | attempt_number                           | integer                     | YES         | null                     |
| public             | opportunities                            | original_creator_id                      | uuid                        | YES         | null                     |
| public             | opportunities                            | quotation_status                         | character varying           | YES         | 50                       |
| public             | opportunities                            | latest_quotation_id                      | uuid                        | YES         | null                     |
| public             | opportunities                            | quotation_count                          | integer                     | YES         | null                     |
| public             | opportunities                            | deal_value                               | numeric                     | YES         | null                     |
| public             | opportunity_stage_history                | history_id                               | bigint                      | NO          | null                     |
| public             | opportunity_stage_history                | opportunity_id                           | text                        | NO          | null                     |
| public             | opportunity_stage_history                | from_stage                               | USER-DEFINED                | YES         | null                     |
| public             | opportunity_stage_history                | to_stage                                 | USER-DEFINED                | NO          | null                     |
| public             | opportunity_stage_history                | changed_by                               | uuid                        | NO          | null                     |
| public             | opportunity_stage_history                | changed_at                               | timestamp with time zone    | YES         | null                     |
| public             | opportunity_stage_history                | reason                                   | text                        | YES         | null                     |
| public             | opportunity_stage_history                | notes                                    | text                        | YES         | null                     |
| public             | opportunity_stage_history                | old_stage                                | USER-DEFINED                | YES         | null                     |
| public             | opportunity_stage_history                | new_stage                                | USER-DEFINED                | NO          | null                     |
| public             | pipeline_updates                         | update_id                                | text                        | NO          | null                     |
| public             | pipeline_updates                         | opportunity_id                           | text                        | NO          | null                     |
| public             | pipeline_updates                         | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | pipeline_updates                         | notes                                    | text                        | YES         | null                     |
| public             | pipeline_updates                         | approach_method                          | USER-DEFINED                | NO          | null                     |
| public             | pipeline_updates                         | evidence_url                             | text                        | YES         | null                     |
| public             | pipeline_updates                         | evidence_file_name                       | text                        | YES         | null                     |
| public             | pipeline_updates                         | location_lat                             | numeric                     | YES         | null                     |
| public             | pipeline_updates                         | location_lng                             | numeric                     | YES         | null                     |
| public             | pipeline_updates                         | location_address                         | text                        | YES         | null                     |
| public             | pipeline_updates                         | old_stage                                | USER-DEFINED                | YES         | null                     |
| public             | pipeline_updates                         | new_stage                                | USER-DEFINED                | NO          | null                     |
| public             | pipeline_updates                         | updated_by                               | uuid                        | YES         | null                     |
| public             | pipeline_updates                         | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | pipeline_updates                         | evidence_original_url                    | text                        | YES         | null                     |
| public             | profiles                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | quotation_rejection_reasons              | id                                       | uuid                        | NO          | null                     |
| public             | quotation_rejection_reasons              | quotation_id                             | uuid                        | NO          | null                     |
| public             | quotation_rejection_reasons              | reason_type                              | USER-DEFINED                | NO          | null                     |
| public             | quotation_rejection_reasons              | competitor_name                          | text                        | YES         | null                     |
| public             | quotation_rejection_reasons              | competitor_amount                        | numeric                     | YES         | null                     |
| public             | quotation_rejection_reasons              | customer_budget                          | numeric                     | YES         | null                     |
| public             | quotation_rejection_reasons              | currency                                 | character varying           | YES         | 3                        |
| public             | quotation_rejection_reasons              | notes                                    | text                        | YES         | null                     |
| public             | quotation_rejection_reasons              | created_by                               | uuid                        | NO          | null                     |
| public             | quotation_rejection_reasons              | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | quotation_term_templates                 | id                                       | uuid                        | NO          | null                     |
| public             | quotation_term_templates                 | term_type                                | character varying           | NO          | 20                       |
| public             | quotation_term_templates                 | term_text                                | text                        | NO          | null                     |
| public             | quotation_term_templates                 | is_default                               | boolean                     | YES         | null                     |
| public             | quotation_term_templates                 | sort_order                               | integer                     | YES         | null                     |
| public             | quotation_term_templates                 | is_active                                | boolean                     | YES         | null                     |
| public             | quotation_term_templates                 | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | sales_plans                              | source_account_id                        | text                        | YES         | null                     |
| public             | sales_plans                              | created_lead_id                          | text                        | YES         | null                     |
| public             | sales_plans                              | created_account_id                       | text                        | YES         | null                     |
| public             | sales_plans                              | created_opportunity_id                   | text                        | YES         | null                     |
| public             | sales_plans                              | created_by                               | uuid                        | YES         | null                     |
| public             | sales_plans                              | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | service_types                            | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | shipment_attachments                     | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | shipment_details                         | lead_id                                  | text                        | NO          | null                     |
| public             | shipment_details                         | created_by                               | uuid                        | YES         | null                     |
| public             | shipment_details                         | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | sla_business_hours                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | sla_holidays                             | created_by                               | uuid                        | YES         | null                     |
| public             | sla_holidays                             | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_assignments                       | id                                       | uuid                        | NO          | null                     |
| public             | ticket_assignments                       | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_assignments                       | assigned_to                              | uuid                        | NO          | null                     |
| public             | ticket_assignments                       | assigned_by                              | uuid                        | NO          | null                     |
| public             | ticket_assignments                       | assigned_at                              | timestamp with time zone    | YES         | null                     |
| public             | ticket_assignments                       | notes                                    | text                        | YES         | null                     |
| public             | ticket_attachments                       | id                                       | uuid                        | NO          | null                     |
| public             | ticket_attachments                       | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_attachments                       | comment_id                               | uuid                        | YES         | null                     |
| public             | ticket_attachments                       | file_name                                | character varying           | NO          | 255                      |
| public             | ticket_attachments                       | file_url                                 | text                        | NO          | null                     |
| public             | ticket_attachments                       | file_type                                | character varying           | NO          | 100                      |
| public             | ticket_attachments                       | file_size                                | integer                     | NO          | null                     |
| public             | ticket_attachments                       | uploaded_by                              | uuid                        | NO          | null                     |
| public             | ticket_attachments                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_attachments                       | file_path                                | text                        | YES         | null                     |
| public             | ticket_comments                          | id                                       | uuid                        | NO          | null                     |
| public             | ticket_comments                          | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_comments                          | user_id                                  | uuid                        | NO          | null                     |
| public             | ticket_comments                          | content                                  | text                        | NO          | null                     |
| public             | ticket_comments                          | is_internal                              | boolean                     | YES         | null                     |
| public             | ticket_comments                          | response_time_seconds                    | integer                     | YES         | null                     |
| public             | ticket_comments                          | response_direction                       | character varying           | YES         | 20                       |
| public             | ticket_comments                          | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_comments                          | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_comments                          | source_event_id                          | uuid                        | YES         | null                     |
| public             | ticket_events                            | id                                       | uuid                        | NO          | null                     |
| public             | ticket_events                            | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_events                            | event_type                               | USER-DEFINED                | NO          | null                     |
| public             | ticket_events                            | actor_user_id                            | uuid                        | NO          | null                     |
| public             | ticket_events                            | old_value                                | jsonb                       | YES         | null                     |
| public             | ticket_events                            | new_value                                | jsonb                       | YES         | null                     |
| public             | ticket_events                            | notes                                    | text                        | YES         | null                     |
| public             | ticket_events                            | ip_address                               | character varying           | YES         | 45                       |
| public             | ticket_events                            | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_rate_quote_items                  | id                                       | uuid                        | NO          | null                     |
| public             | ticket_rate_quote_items                  | quote_id                                 | uuid                        | NO          | null                     |
| public             | ticket_rate_quote_items                  | component_type                           | character varying           | NO          | 100                      |
| public             | ticket_rate_quote_items                  | component_name                           | character varying           | YES         | 255                      |
| public             | ticket_rate_quote_items                  | description                              | text                        | YES         | null                     |
| public             | ticket_rate_quote_items                  | cost_amount                              | numeric                     | NO          | null                     |
| public             | ticket_rate_quote_items                  | quantity                                 | numeric                     | YES         | null                     |
| public             | ticket_rate_quote_items                  | unit                                     | character varying           | YES         | 50                       |
| public             | ticket_rate_quote_items                  | sort_order                               | integer                     | YES         | null                     |
| public             | ticket_rate_quote_items                  | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_rate_quote_items                  | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_rate_quotes                       | id                                       | uuid                        | NO          | null                     |
| public             | ticket_rate_quotes                       | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_rate_quotes                       | quote_number                             | character varying           | NO          | 30                       |
| public             | ticket_rate_quotes                       | amount                                   | numeric                     | NO          | null                     |
| public             | ticket_rate_quotes                       | currency                                 | character varying           | YES         | 3                        |
| public             | ticket_rate_quotes                       | valid_until                              | date                        | NO          | null                     |
| public             | ticket_rate_quotes                       | terms                                    | text                        | YES         | null                     |
| public             | ticket_rate_quotes                       | status                                   | USER-DEFINED                | YES         | null                     |
| public             | ticket_rate_quotes                       | created_by                               | uuid                        | NO          | null                     |
| public             | ticket_rate_quotes                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_rate_quotes                       | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_rate_quotes                       | rate_structure                           | character varying           | YES         | 20                       |
| public             | ticket_rate_quotes                       | customer_quotation_id                    | uuid                        | YES         | null                     |
| public             | ticket_rate_quotes                       | lead_id                                  | text                        | YES         | null                     |
| public             | ticket_rate_quotes                       | opportunity_id                           | text                        | YES         | null                     |
| public             | ticket_rate_quotes                       | is_current                               | boolean                     | NO          | null                     |
| public             | ticket_rate_quotes                       | superseded_by_id                         | uuid                        | YES         | null                     |
| public             | ticket_rate_quotes                       | superseded_at                            | timestamp with time zone    | YES         | null                     |
| public             | ticket_response_exchanges                | id                                       | uuid                        | NO          | null                     |
| public             | ticket_response_exchanges                | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_response_exchanges                | responder_user_id                        | uuid                        | NO          | null                     |
| public             | ticket_response_exchanges                | responder_type                           | USER-DEFINED                | NO          | null                     |
| public             | ticket_response_exchanges                | comment_id                               | uuid                        | YES         | null                     |
| public             | ticket_response_exchanges                | previous_response_at                     | timestamp with time zone    | YES         | null                     |
| public             | ticket_response_exchanges                | responded_at                             | timestamp with time zone    | NO          | null                     |
| public             | ticket_response_exchanges                | raw_response_seconds                     | integer                     | YES         | null                     |
| public             | ticket_response_exchanges                | business_response_seconds                | integer                     | YES         | null                     |
| public             | ticket_response_exchanges                | exchange_number                          | integer                     | NO          | null                     |
| public             | ticket_response_exchanges                | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_response_metrics                  | id                                       | uuid                        | NO          | null                     |
| public             | ticket_response_metrics                  | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_response_metrics                  | creator_total_responses                  | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | creator_avg_response_seconds             | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | creator_avg_business_response_seconds    | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | assignee_total_responses                 | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | assignee_avg_response_seconds            | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | assignee_avg_business_response_seconds   | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | assignee_first_response_seconds          | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | assignee_first_response_business_seconds | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | time_to_first_quote_seconds              | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | time_to_first_quote_business_seconds     | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | time_to_resolution_seconds               | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | time_to_resolution_business_seconds      | integer                     | YES         | null                     |
| public             | ticket_response_metrics                  | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_response_metrics                  | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_responses                         | id                                       | uuid                        | NO          | null                     |
| public             | ticket_responses                         | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_responses                         | user_id                                  | uuid                        | NO          | null                     |
| public             | ticket_responses                         | responder_role                           | character varying           | NO          | 20                       |
| public             | ticket_responses                         | ticket_stage                             | character varying           | YES         | 50                       |
| public             | ticket_responses                         | responded_at                             | timestamp with time zone    | YES         | null                     |
| public             | ticket_responses                         | response_time_seconds                    | integer                     | YES         | null                     |
| public             | ticket_responses                         | comment_id                               | uuid                        | YES         | null                     |
| public             | ticket_responses                         | sla_target_seconds                       | integer                     | YES         | null                     |
| public             | ticket_responses                         | sla_met                                  | boolean                     | YES         | null                     |
| public             | ticket_responses                         | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_sequences                         | id                                       | uuid                        | NO          | null                     |
| public             | ticket_sequences                         | ticket_type                              | USER-DEFINED                | NO          | null                     |
| public             | ticket_sequences                         | department                               | USER-DEFINED                | NO          | null                     |
| public             | ticket_sequences                         | date_key                                 | character varying           | NO          | 6                        |
| public             | ticket_sequences                         | last_sequence                            | integer                     | YES         | null                     |
| public             | ticket_sequences                         | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_sequences                         | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_sla_tracking                      | id                                       | uuid                        | NO          | null                     |
| public             | ticket_sla_tracking                      | ticket_id                                | uuid                        | NO          | null                     |
| public             | ticket_sla_tracking                      | first_response_at                        | timestamp with time zone    | YES         | null                     |
| public             | ticket_sla_tracking                      | first_response_sla_hours                 | integer                     | NO          | null                     |
| public             | ticket_sla_tracking                      | first_response_met                       | boolean                     | YES         | null                     |
| public             | ticket_sla_tracking                      | resolution_at                            | timestamp with time zone    | YES         | null                     |
| public             | ticket_sla_tracking                      | resolution_sla_hours                     | integer                     | NO          | null                     |
| public             | ticket_sla_tracking                      | resolution_met                           | boolean                     | YES         | null                     |
| public             | ticket_sla_tracking                      | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticket_sla_tracking                      | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticketing_sla_config                     | id                                       | uuid                        | NO          | null                     |
| public             | ticketing_sla_config                     | department                               | USER-DEFINED                | NO          | null                     |
| public             | ticketing_sla_config                     | ticket_type                              | USER-DEFINED                | NO          | null                     |
| public             | ticketing_sla_config                     | first_response_hours                     | integer                     | YES         | null                     |
| public             | ticketing_sla_config                     | resolution_hours                         | integer                     | YES         | null                     |
| public             | ticketing_sla_config                     | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | ticketing_sla_config                     | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | id                                       | uuid                        | NO          | null                     |
| public             | tickets                                  | ticket_code                              | character varying           | NO          | 20                       |
| public             | tickets                                  | ticket_type                              | USER-DEFINED                | NO          | null                     |
| public             | tickets                                  | status                                   | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | priority                                 | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | subject                                  | character varying           | NO          | 255                      |
| public             | tickets                                  | description                              | text                        | YES         | null                     |
| public             | tickets                                  | department                               | USER-DEFINED                | NO          | null                     |
| public             | tickets                                  | account_id                               | text                        | YES         | null                     |
| public             | tickets                                  | contact_id                               | text                        | YES         | null                     |
| public             | tickets                                  | created_by                               | uuid                        | NO          | null                     |
| public             | tickets                                  | assigned_to                              | uuid                        | YES         | null                     |
| public             | tickets                                  | rfq_data                                 | jsonb                       | YES         | null                     |
| public             | tickets                                  | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | first_response_at                        | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | resolved_at                              | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | closed_at                                | timestamp with time zone    | YES         | null                     |
| public             | tickets                                  | close_outcome                            | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | close_reason                             | text                        | YES         | null                     |
| public             | tickets                                  | competitor_name                          | character varying           | YES         | 255                      |
| public             | tickets                                  | competitor_cost                          | numeric                     | YES         | null                     |
| public             | tickets                                  | pending_response_from                    | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | sender_name                              | character varying           | YES         | 255                      |
| public             | tickets                                  | sender_email                             | character varying           | YES         | 255                      |
| public             | tickets                                  | sender_phone                             | character varying           | YES         | 50                       |
| public             | tickets                                  | show_sender_to_ops                       | boolean                     | YES         | null                     |
| public             | tickets                                  | lead_id                                  | text                        | YES         | null                     |
| public             | tickets                                  | opportunity_id                           | text                        | YES         | null                     |
| public             | tickets                                  | origin_department                        | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | origin_dept                              | USER-DEFINED                | YES         | null                     |
| public             | tickets                                  | target_dept                              | USER-DEFINED                | YES         | null                     |
| public             | v_accounts_enriched                      | account_id                               | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | company_name                             | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | domain                                   | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | npwp                                     | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | industry                                 | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | address                                  | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | city                                     | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | province                                 | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | country                                  | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | postal_code                              | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | phone                                    | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | pic_name                                 | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | pic_email                                | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | pic_phone                                | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | owner_user_id                            | uuid                        | YES         | null                     |
| public             | v_accounts_enriched                      | tenure_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_accounts_enriched                      | activity_status                          | USER-DEFINED                | YES         | null                     |
| public             | v_accounts_enriched                      | account_status                           | USER-DEFINED                | YES         | null                     |
| public             | v_accounts_enriched                      | first_deal_date                          | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_enriched                      | last_transaction_date                    | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_enriched                      | is_active                                | boolean                     | YES         | null                     |
| public             | v_accounts_enriched                      | tags                                     | ARRAY                       | YES         | null                     |
| public             | v_accounts_enriched                      | notes                                    | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | dedupe_key                               | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | created_by                               | uuid                        | YES         | null                     |
| public             | v_accounts_enriched                      | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_enriched                      | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_enriched                      | lead_id                                  | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | retry_count                              | integer                     | YES         | null                     |
| public             | v_accounts_enriched                      | owner_name                               | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | owner_email                              | text                        | YES         | null                     |
| public             | v_accounts_enriched                      | open_opportunities                       | bigint                      | YES         | null                     |
| public             | v_accounts_enriched                      | pipeline_value                           | numeric                     | YES         | null                     |
| public             | v_accounts_enriched                      | contact_count                            | bigint                      | YES         | null                     |
| public             | v_accounts_enriched                      | planned_activities                       | bigint                      | YES         | null                     |
| public             | v_accounts_enriched                      | overdue_activities                       | bigint                      | YES         | null                     |
| public             | v_accounts_enriched                      | revenue_total                            | numeric                     | YES         | null                     |
| public             | v_accounts_enriched                      | actual_revenue                           | numeric                     | YES         | null                     |
| public             | v_accounts_enriched                      | total_payment                            | numeric                     | YES         | null                     |
| public             | v_accounts_enriched                      | total_outstanding                        | numeric                     | YES         | null                     |
| public             | v_accounts_with_status                   | account_id                               | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | company_name                             | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | pic_name                                 | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | pic_email                                | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | pic_phone                                | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | industry                                 | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | address                                  | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | city                                     | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | province                                 | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | country                                  | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | account_status                           | USER-DEFINED                | YES         | null                     |
| public             | v_accounts_with_status                   | first_transaction_date                   | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_with_status                   | last_transaction_date                    | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_with_status                   | lead_id                                  | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | owner_user_id                            | uuid                        | YES         | null                     |
| public             | v_accounts_with_status                   | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_with_status                   | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_accounts_with_status                   | owner_name                               | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | owner_email                              | text                        | YES         | null                     |
| public             | v_accounts_with_status                   | opportunity_count                        | bigint                      | YES         | null                     |
| public             | v_accounts_with_status                   | total_pipeline_value                     | numeric                     | YES         | null                     |
| public             | v_accounts_with_status                   | won_opportunities                        | bigint                      | YES         | null                     |
| public             | v_accounts_with_status                   | calculated_status                        | USER-DEFINED                | YES         | null                     |
| public             | v_activities_planner                     | related_account_id                       | text                        | YES         | null                     |
| public             | v_activities_planner                     | related_opportunity_id                   | text                        | YES         | null                     |
| public             | v_activities_planner                     | related_lead_id                          | text                        | YES         | null                     |
| public             | v_activities_planner                     | created_by                               | uuid                        | YES         | null                     |
| public             | v_activities_planner                     | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_activities_planner                     | account_name                             | text                        | YES         | null                     |
| public             | v_activities_planner                     | opportunity_name                         | text                        | YES         | null                     |
| public             | v_activities_planner                     | lead_company                             | text                        | YES         | null                     |
| public             | v_activities_unified                     | account_id                               | text                        | YES         | null                     |
| public             | v_activities_unified                     | opportunity_id                           | text                        | YES         | null                     |
| public             | v_activities_unified                     | lead_id                                  | text                        | YES         | null                     |
| public             | v_activities_unified                     | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_activities_unified                     | account_name                             | text                        | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | rejection_reason                         | text                        | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | rejection_count                          | bigint                      | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | tickets_affected                         | bigint                      | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | leads_affected                           | bigint                      | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | opportunities_affected                   | bigint                      | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | avg_rejected_value                       | numeric                     | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | total_rejected_value                     | numeric                     | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | source_type                              | character varying           | YES         | 20                       |
| public             | v_customer_quotation_rejection_analytics | creator_department                       | text                        | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | rejection_date                           | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | rejection_week                           | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotation_rejection_analytics | rejection_month                          | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotations_enriched           | id                                       | uuid                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | quotation_number                         | character varying           | YES         | 50                       |
| public             | v_customer_quotations_enriched           | sequence_number                          | integer                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | sequence_label                           | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | sequence_label_id                        | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | status                                   | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | source_type                              | character varying           | YES         | 20                       |
| public             | v_customer_quotations_enriched           | customer_name                            | character varying           | YES         | 255                      |
| public             | v_customer_quotations_enriched           | customer_company                         | character varying           | YES         | 255                      |
| public             | v_customer_quotations_enriched           | customer_email                           | character varying           | YES         | 255                      |
| public             | v_customer_quotations_enriched           | customer_phone                           | character varying           | YES         | 50                       |
| public             | v_customer_quotations_enriched           | customer_address                         | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | service_type                             | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | fleet_type                               | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | fleet_quantity                           | integer                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | incoterm                                 | character varying           | YES         | 20                       |
| public             | v_customer_quotations_enriched           | commodity                                | character varying           | YES         | 255                      |
| public             | v_customer_quotations_enriched           | cargo_description                        | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | cargo_weight                             | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | cargo_weight_unit                        | character varying           | YES         | 10                       |
| public             | v_customer_quotations_enriched           | cargo_volume                             | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | cargo_volume_unit                        | character varying           | YES         | 10                       |
| public             | v_customer_quotations_enriched           | cargo_quantity                           | integer                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | cargo_quantity_unit                      | character varying           | YES         | 50                       |
| public             | v_customer_quotations_enriched           | estimated_leadtime                       | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | estimated_cargo_value                    | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | cargo_value_currency                     | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | origin_address                           | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | origin_city                              | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | origin_country                           | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | origin_port                              | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | destination_address                      | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | destination_city                         | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | destination_country                      | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | destination_port                         | character varying           | YES         | 100                      |
| public             | v_customer_quotations_enriched           | rate_structure                           | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | total_cost                               | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | target_margin_percent                    | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | total_selling_rate                       | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | currency                                 | character varying           | YES         | 3                        |
| public             | v_customer_quotations_enriched           | scope_of_work                            | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | terms_includes                           | jsonb                       | YES         | null                     |
| public             | v_customer_quotations_enriched           | terms_excludes                           | jsonb                       | YES         | null                     |
| public             | v_customer_quotations_enriched           | terms_notes                              | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | validity_days                            | integer                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | valid_until                              | date                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | sent_at                                  | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotations_enriched           | sent_via                                 | character varying           | YES         | 20                       |
| public             | v_customer_quotations_enriched           | pdf_url                                  | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | rejection_reason                         | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotations_enriched           | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_customer_quotations_enriched           | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | ticket_code                              | character varying           | YES         | 20                       |
| public             | v_customer_quotations_enriched           | ticket_subject                           | character varying           | YES         | 255                      |
| public             | v_customer_quotations_enriched           | ticket_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | lead_id                                  | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | lead_company_name                        | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | lead_contact_name                        | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | lead_status                              | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | opportunity_id                           | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | opportunity_name                         | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | opportunity_stage                        | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | opportunity_value                        | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | account_id                               | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | account_company_name                     | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | operational_cost_id                      | uuid                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | operational_cost_number                  | character varying           | YES         | 30                       |
| public             | v_customer_quotations_enriched           | operational_cost_amount                  | numeric                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | operational_cost_status                  | USER-DEFINED                | YES         | null                     |
| public             | v_customer_quotations_enriched           | created_by                               | uuid                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | creator_name                             | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | creator_email                            | text                        | YES         | null                     |
| public             | v_customer_quotations_enriched           | is_expired                               | boolean                     | YES         | null                     |
| public             | v_customer_quotations_enriched           | status_order                             | integer                     | YES         | null                     |
| public             | v_disqualified_leads                     | lead_id                                  | text                        | YES         | null                     |
| public             | v_disqualified_leads                     | company_name                             | text                        | YES         | null                     |
| public             | v_disqualified_leads                     | contact_name                             | text                        | YES         | null                     |
| public             | v_disqualified_leads                     | disqualified_by_name                     | text                        | YES         | null                     |
| public             | v_disqualified_leads                     | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_disqualified_leads                     | disqualified_at                          | timestamp with time zone    | YES         | null                     |
| public             | v_latest_operational_costs               | id                                       | uuid                        | YES         | null                     |
| public             | v_latest_operational_costs               | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_latest_operational_costs               | status                                   | USER-DEFINED                | YES         | null                     |
| public             | v_latest_operational_costs               | amount                                   | numeric                     | YES         | null                     |
| public             | v_latest_operational_costs               | currency                                 | character varying           | YES         | 3                        |
| public             | v_latest_operational_costs               | rate_structure                           | character varying           | YES         | 20                       |
| public             | v_latest_operational_costs               | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_latest_operational_costs               | created_by                               | uuid                        | YES         | null                     |
| public             | v_latest_operational_costs               | created_by_name                          | text                        | YES         | null                     |
| public             | v_latest_operational_costs               | ticket_code                              | character varying           | YES         | 20                       |
| public             | v_latest_operational_costs               | ticket_type                              | USER-DEFINED                | YES         | null                     |
| public             | v_lead_bidding                           | lead_id                                  | text                        | YES         | null                     |
| public             | v_lead_bidding                           | company_name                             | text                        | YES         | null                     |
| public             | v_lead_bidding                           | contact_name                             | text                        | YES         | null                     |
| public             | v_lead_bidding                           | contact_email                            | text                        | YES         | null                     |
| public             | v_lead_bidding                           | contact_phone                            | text                        | YES         | null                     |
| public             | v_lead_bidding                           | industry                                 | text                        | YES         | null                     |
| public             | v_lead_bidding                           | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_lead_bidding                           | source                                   | text                        | YES         | null                     |
| public             | v_lead_bidding                           | priority                                 | integer                     | YES         | null                     |
| public             | v_lead_bidding                           | potential_revenue                        | numeric                     | YES         | null                     |
| public             | v_lead_bidding                           | claim_status                             | USER-DEFINED                | YES         | null                     |
| public             | v_lead_bidding                           | claimed_by_name                          | text                        | YES         | null                     |
| public             | v_lead_bidding                           | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_lead_bidding                           | qualified_at                             | timestamp with time zone    | YES         | null                     |
| public             | v_lead_bidding                           | created_by                               | uuid                        | YES         | null                     |
| public             | v_lead_bidding                           | pool_id                                  | bigint                      | YES         | null                     |
| public             | v_lead_bidding                           | handed_over_at                           | timestamp with time zone    | YES         | null                     |
| public             | v_lead_bidding                           | handover_notes                           | text                        | YES         | null                     |
| public             | v_lead_bidding                           | handed_over_by_name                      | text                        | YES         | null                     |
| public             | v_lead_bidding                           | creator_name                             | text                        | YES         | null                     |
| public             | v_lead_bidding                           | creator_department                       | text                        | YES         | null                     |
| public             | v_lead_inbox                             | lead_id                                  | text                        | YES         | null                     |
| public             | v_lead_inbox                             | company_name                             | text                        | YES         | null                     |
| public             | v_lead_inbox                             | contact_name                             | text                        | YES         | null                     |
| public             | v_lead_inbox                             | contact_email                            | text                        | YES         | null                     |
| public             | v_lead_inbox                             | contact_phone                            | text                        | YES         | null                     |
| public             | v_lead_inbox                             | industry                                 | text                        | YES         | null                     |
| public             | v_lead_inbox                             | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_lead_inbox                             | source                                   | text                        | YES         | null                     |
| public             | v_lead_inbox                             | source_detail                            | text                        | YES         | null                     |
| public             | v_lead_inbox                             | priority                                 | integer                     | YES         | null                     |
| public             | v_lead_inbox                             | potential_revenue                        | numeric                     | YES         | null                     |
| public             | v_lead_inbox                             | claim_status                             | USER-DEFINED                | YES         | null                     |
| public             | v_lead_inbox                             | claimed_by_name                          | text                        | YES         | null                     |
| public             | v_lead_inbox                             | notes                                    | text                        | YES         | null                     |
| public             | v_lead_inbox                             | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_lead_inbox                             | created_by                               | uuid                        | YES         | null                     |
| public             | v_lead_inbox                             | marketing_owner_user_id                  | uuid                        | YES         | null                     |
| public             | v_lead_inbox                             | sales_owner_user_id                      | uuid                        | YES         | null                     |
| public             | v_lead_inbox                             | disqualified_at                          | timestamp with time zone    | YES         | null                     |
| public             | v_lead_inbox                             | disqualified_reason                      | text                        | YES         | null                     |
| public             | v_lead_inbox                             | marketing_owner_name                     | text                        | YES         | null                     |
| public             | v_lead_inbox                             | marketing_owner_email                    | text                        | YES         | null                     |
| public             | v_lead_inbox                             | sales_owner_name                         | text                        | YES         | null                     |
| public             | v_lead_inbox                             | creator_name                             | text                        | YES         | null                     |
| public             | v_lead_inbox                             | creator_department                       | text                        | YES         | null                     |
| public             | v_lead_inbox                             | creator_role                             | USER-DEFINED                | YES         | null                     |
| public             | v_lead_inbox                             | creator_is_marketing                     | boolean                     | YES         | null                     |
| public             | v_lead_management                        | lead_id                                  | text                        | YES         | null                     |
| public             | v_lead_management                        | company_name                             | text                        | YES         | null                     |
| public             | v_lead_management                        | contact_name                             | text                        | YES         | null                     |
| public             | v_lead_management                        | contact_email                            | text                        | YES         | null                     |
| public             | v_lead_management                        | contact_phone                            | text                        | YES         | null                     |
| public             | v_lead_management                        | industry                                 | text                        | YES         | null                     |
| public             | v_lead_management                        | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_lead_management                        | source                                   | text                        | YES         | null                     |
| public             | v_lead_management                        | source_detail                            | text                        | YES         | null                     |
| public             | v_lead_management                        | priority                                 | integer                     | YES         | null                     |
| public             | v_lead_management                        | potential_revenue                        | numeric                     | YES         | null                     |
| public             | v_lead_management                        | claim_status                             | USER-DEFINED                | YES         | null                     |
| public             | v_lead_management                        | claimed_by_name                          | text                        | YES         | null                     |
| public             | v_lead_management                        | notes                                    | text                        | YES         | null                     |
| public             | v_lead_management                        | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_lead_management                        | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_lead_management                        | marketing_owner_user_id                  | uuid                        | YES         | null                     |
| public             | v_lead_management                        | sales_owner_user_id                      | uuid                        | YES         | null                     |
| public             | v_lead_management                        | created_by                               | uuid                        | YES         | null                     |
| public             | v_lead_management                        | disqualified_at                          | timestamp with time zone    | YES         | null                     |
| public             | v_lead_management                        | disqualified_reason                      | text                        | YES         | null                     |
| public             | v_lead_management                        | qualified_at                             | timestamp with time zone    | YES         | null                     |
| public             | v_lead_management                        | claimed_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_lead_management                        | account_id                               | text                        | YES         | null                     |
| public             | v_lead_management                        | opportunity_id                           | text                        | YES         | null                     |
| public             | v_lead_management                        | marketing_owner_name                     | text                        | YES         | null                     |
| public             | v_lead_management                        | marketing_owner_email                    | text                        | YES         | null                     |
| public             | v_lead_management                        | marketing_department                     | text                        | YES         | null                     |
| public             | v_lead_management                        | sales_owner_name                         | text                        | YES         | null                     |
| public             | v_lead_management                        | creator_name                             | text                        | YES         | null                     |
| public             | v_lead_management                        | creator_department                       | text                        | YES         | null                     |
| public             | v_lead_management                        | creator_role                             | USER-DEFINED                | YES         | null                     |
| public             | v_lead_management                        | creator_is_marketing                     | boolean                     | YES         | null                     |
| public             | v_lead_management                        | account_company_name                     | text                        | YES         | null                     |
| public             | v_my_leads                               | lead_id                                  | text                        | YES         | null                     |
| public             | v_my_leads                               | company_name                             | text                        | YES         | null                     |
| public             | v_my_leads                               | contact_name                             | text                        | YES         | null                     |
| public             | v_my_leads                               | contact_email                            | text                        | YES         | null                     |
| public             | v_my_leads                               | contact_phone                            | text                        | YES         | null                     |
| public             | v_my_leads                               | industry                                 | text                        | YES         | null                     |
| public             | v_my_leads                               | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_my_leads                               | source                                   | text                        | YES         | null                     |
| public             | v_my_leads                               | priority                                 | integer                     | YES         | null                     |
| public             | v_my_leads                               | potential_revenue                        | numeric                     | YES         | null                     |
| public             | v_my_leads                               | claim_status                             | USER-DEFINED                | YES         | null                     |
| public             | v_my_leads                               | claimed_by_name                          | text                        | YES         | null                     |
| public             | v_my_leads                               | notes                                    | text                        | YES         | null                     |
| public             | v_my_leads                               | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_my_leads                               | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_my_leads                               | sales_owner_user_id                      | uuid                        | YES         | null                     |
| public             | v_my_leads                               | qualified_at                             | timestamp with time zone    | YES         | null                     |
| public             | v_my_leads                               | claimed_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_my_leads                               | account_id                               | text                        | YES         | null                     |
| public             | v_my_leads                               | opportunity_id                           | text                        | YES         | null                     |
| public             | v_my_leads                               | created_by                               | uuid                        | YES         | null                     |
| public             | v_my_leads                               | account_company_name                     | text                        | YES         | null                     |
| public             | v_my_leads                               | creator_name                             | text                        | YES         | null                     |
| public             | v_my_leads                               | creator_department                       | text                        | YES         | null                     |
| public             | v_nurture_leads                          | lead_id                                  | text                        | YES         | null                     |
| public             | v_nurture_leads                          | company_name                             | text                        | YES         | null                     |
| public             | v_nurture_leads                          | contact_name                             | text                        | YES         | null                     |
| public             | v_nurture_leads                          | marketing_owner_name                     | text                        | YES         | null                     |
| public             | v_nurture_leads                          | triage_status                            | USER-DEFINED                | YES         | null                     |
| public             | v_nurture_leads                          | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_nurture_leads                          | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | rejection_reason_type                    | USER-DEFINED                | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | rejection_count                          | bigint                      | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | tickets_affected                         | bigint                      | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | assignees_affected                       | bigint                      | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | avg_rejected_amount                      | numeric                     | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | total_rejected_amount                    | numeric                     | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | assignee_department                      | text                        | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | rejection_date                           | timestamp with time zone    | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | rejection_week                           | timestamp with time zone    | YES         | null                     |
| public             | v_ops_cost_rejection_analytics           | rejection_month                          | timestamp with time zone    | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | quotation_id                             | uuid                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | quotation_number                         | character varying           | YES         | 50                       |
| public             | v_orphan_quotation_opportunities         | orphan_opportunity_id                    | text                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | lead_id                                  | text                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | ticket_opportunity_id                    | text                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | lead_opportunity_id                      | text                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | lead_account_id                          | text                        | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_orphan_quotation_opportunities         | status                                   | USER-DEFINED                | YES         | null                     |
| public             | v_pipeline_active                        | opportunity_id                           | text                        | YES         | null                     |
| public             | v_pipeline_active                        | account_id                               | text                        | YES         | null                     |
| public             | v_pipeline_active                        | opportunity_name                         | text                        | YES         | null                     |
| public             | v_pipeline_active                        | description                              | text                        | YES         | null                     |
| public             | v_pipeline_active                        | service_codes                            | ARRAY                       | YES         | null                     |
| public             | v_pipeline_active                        | route                                    | text                        | YES         | null                     |
| public             | v_pipeline_active                        | origin                                   | text                        | YES         | null                     |
| public             | v_pipeline_active                        | destination                              | text                        | YES         | null                     |
| public             | v_pipeline_active                        | estimated_value                          | numeric                     | YES         | null                     |
| public             | v_pipeline_active                        | currency                                 | text                        | YES         | null                     |
| public             | v_pipeline_active                        | probability                              | integer                     | YES         | null                     |
| public             | v_pipeline_active                        | stage                                    | USER-DEFINED                | YES         | null                     |
| public             | v_pipeline_active                        | next_step                                | text                        | YES         | null                     |
| public             | v_pipeline_active                        | next_step_due_date                       | date                        | YES         | null                     |
| public             | v_pipeline_active                        | owner_user_id                            | uuid                        | YES         | null                     |
| public             | v_pipeline_active                        | closed_at                                | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_active                        | outcome                                  | text                        | YES         | null                     |
| public             | v_pipeline_active                        | lost_reason                              | text                        | YES         | null                     |
| public             | v_pipeline_active                        | competitor                               | text                        | YES         | null                     |
| public             | v_pipeline_active                        | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_active                        | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_active                        | account_name                             | text                        | YES         | null                     |
| public             | v_pipeline_active                        | account_pic                              | text                        | YES         | null                     |
| public             | v_pipeline_active                        | owner_name                               | text                        | YES         | null                     |
| public             | v_pipeline_active                        | owner_email                              | text                        | YES         | null                     |
| public             | v_pipeline_active                        | is_overdue                               | boolean                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | opportunity_id                           | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | name                                     | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_id                               | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | source_lead_id                           | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | stage                                    | USER-DEFINED                | YES         | null                     |
| public             | v_pipeline_with_updates                  | estimated_value                          | numeric                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | deal_value                               | numeric                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | currency                                 | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | probability                              | integer                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | next_step                                | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | next_step_due_date                       | date                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | owner_user_id                            | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | created_by                               | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_with_updates                  | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_with_updates                  | closed_at                                | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_with_updates                  | outcome                                  | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | lost_reason                              | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | competitor                               | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | attempt_number                           | integer                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | competitor_price                         | numeric                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | customer_budget                          | numeric                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | original_creator_id                      | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_name                             | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_pic_name                         | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_pic_email                        | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_pic_phone                        | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_status                           | USER-DEFINED                | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_original_lead_id                 | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | account_original_creator_id              | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | owner_name                               | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | owner_email                              | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | lead_company_name                        | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | lead_created_by                          | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | lead_marketing_owner                     | uuid                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | lead_source                              | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | original_creator_name                    | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | original_creator_role                    | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | original_creator_department              | text                        | YES         | null                     |
| public             | v_pipeline_with_updates                  | original_creator_is_marketing            | boolean                     | YES         | null                     |
| public             | v_pipeline_with_updates                  | update_count                             | bigint                      | YES         | null                     |
| public             | v_pipeline_with_updates                  | last_update_at                           | timestamp with time zone    | YES         | null                     |
| public             | v_pipeline_with_updates                  | is_overdue                               | boolean                     | YES         | null                     |
| public             | v_sales_inbox                            | lead_id                                  | text                        | YES         | null                     |
| public             | v_sales_inbox                            | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_sla_metrics                            | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_sla_metrics                            | ticket_code                              | character varying           | YES         | 20                       |
| public             | v_sla_metrics                            | ticket_type                              | USER-DEFINED                | YES         | null                     |
| public             | v_sla_metrics                            | ticket_created_at                        | timestamp with time zone    | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | id                                       | uuid                        | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | metric_type                              | text                        | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | actual_seconds                           | integer                     | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | sla_seconds                              | integer                     | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | sla_met                                  | boolean                     | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_ticket_response_metrics_unpivot        | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_ticket_sla_audit                       | ticket_id                                | uuid                        | YES         | null                     |
| public             | v_ticket_sla_audit                       | ticket_code                              | character varying           | YES         | 20                       |
| public             | v_ticket_sla_audit                       | status                                   | USER-DEFINED                | YES         | null                     |
| public             | v_ticket_sla_audit                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | v_ticket_sla_audit                       | pending_response_from                    | USER-DEFINED                | YES         | null                     |
| public             | v_ticket_sla_audit                       | event_count                              | bigint                      | YES         | null                     |
| public             | v_ticket_sla_audit                       | exchange_count                           | bigint                      | YES         | null                     |
| public             | v_ticket_sla_audit                       | system_comment_count                     | bigint                      | YES         | null                     |
| public             | v_ticket_sla_audit                       | user_comment_count                       | bigint                      | YES         | null                     |
| public             | v_ticket_sla_audit                       | creator_total_responses                  | integer                     | YES         | null                     |
| public             | v_ticket_sla_audit                       | assignee_total_responses                 | integer                     | YES         | null                     |
| public             | v_ticket_sla_audit                       | assignee_first_response_seconds          | integer                     | YES         | null                     |
| public             | v_ticket_sla_audit                       | time_to_first_quote_seconds              | integer                     | YES         | null                     |
| public             | v_ticket_sla_audit                       | time_to_resolution_seconds               | integer                     | YES         | null                     |
| public             | v_ticket_sla_audit                       | sla_tracking_status                      | text                        | YES         | null                     |
| public             | v_ticketing_leaderboard                  | user_id                                  | uuid                        | YES         | null                     |
| public             | v_ticketing_leaderboard                  | name                                     | text                        | YES         | null                     |
| public             | v_ticketing_leaderboard                  | role                                     | USER-DEFINED                | YES         | null                     |
| public             | v_ticketing_leaderboard                  | department                               | text                        | YES         | null                     |
| public             | v_ticketing_leaderboard                  | tickets_assigned                         | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | tickets_completed                        | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | completion_rate                          | numeric                     | YES         | null                     |
| public             | v_ticketing_leaderboard                  | avg_first_response_seconds               | numeric                     | YES         | null                     |
| public             | v_ticketing_leaderboard                  | first_response_count                     | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | quotes_submitted                         | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | tickets_won                              | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | tickets_lost                             | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | win_rate                                 | numeric                     | YES         | null                     |
| public             | v_ticketing_leaderboard                  | rank_by_completion                       | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | rank_by_response_speed                   | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | rank_by_win_rate                         | bigint                      | YES         | null                     |
| public             | v_ticketing_leaderboard                  | rank_by_quotes                           | bigint                      | YES         | null                     |
| public             | vw_company_sla_metrics                   | ticket_type                              | text                        | YES         | null                     |
| public             | vw_company_sla_metrics                   | total_tickets_created                    | numeric                     | YES         | null                     |
| public             | vw_company_sla_metrics                   | total_tickets_assigned                   | numeric                     | YES         | null                     |
| public             | vw_company_sla_metrics                   | total_accepted_costs                     | numeric                     | YES         | null                     |
| public             | vw_company_sla_metrics                   | total_rejected_costs                     | numeric                     | YES         | null                     |
| public             | vw_company_sla_metrics                   | cost_acceptance_rate_percent             | numeric                     | YES         | null                     |
| public             | vw_department_sla_metrics                | ticket_type                              | text                        | YES         | null                     |
| public             | vw_department_sla_metrics                | total_tickets_created                    | numeric                     | YES         | null                     |
| public             | vw_department_sla_metrics                | total_tickets_assigned                   | numeric                     | YES         | null                     |
| public             | vw_department_sla_metrics                | total_accepted_costs                     | numeric                     | YES         | null                     |
| public             | vw_department_sla_metrics                | total_rejected_costs                     | numeric                     | YES         | null                     |
| public             | vw_department_sla_metrics                | cost_acceptance_rate_percent             | numeric                     | YES         | null                     |
| public             | vw_operational_cost_rejection_analytics  | reason_type                              | USER-DEFINED                | YES         | null                     |
| public             | vw_operational_cost_rejection_analytics  | count                                    | bigint                      | YES         | null                     |
| public             | vw_operational_cost_rejection_analytics  | percentage                               | numeric                     | YES         | null                     |
| public             | vw_operational_cost_rejection_analytics  | avg_suggested_amount                     | numeric                     | YES         | null                     |
| public             | vw_operational_cost_rejection_analytics  | month                                    | timestamp with time zone    | YES         | null                     |
| public             | vw_pipeline_detail                       | opportunity_id                           | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | name                                     | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | stage                                    | USER-DEFINED                | YES         | null                     |
| public             | vw_pipeline_detail                       | estimated_value                          | numeric                     | YES         | null                     |
| public             | vw_pipeline_detail                       | deal_value                               | numeric                     | YES         | null                     |
| public             | vw_pipeline_detail                       | currency                                 | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | probability                              | integer                     | YES         | null                     |
| public             | vw_pipeline_detail                       | expected_close_date                      | date                        | YES         | null                     |
| public             | vw_pipeline_detail                       | next_step                                | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | next_step_due_date                       | date                        | YES         | null                     |
| public             | vw_pipeline_detail                       | close_reason                             | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | lost_reason                              | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | competitor_price                         | numeric                     | YES         | null                     |
| public             | vw_pipeline_detail                       | customer_budget                          | numeric                     | YES         | null                     |
| public             | vw_pipeline_detail                       | closed_at                                | timestamp with time zone    | YES         | null                     |
| public             | vw_pipeline_detail                       | notes                                    | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | created_at                               | timestamp with time zone    | YES         | null                     |
| public             | vw_pipeline_detail                       | updated_at                               | timestamp with time zone    | YES         | null                     |
| public             | vw_pipeline_detail                       | quotation_status                         | character varying           | YES         | 50                       |
| public             | vw_pipeline_detail                       | latest_quotation_id                      | uuid                        | YES         | null                     |
| public             | vw_pipeline_detail                       | account_id                               | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | company_name                             | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | industry                                 | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | address                                  | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | city                                     | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | account_status                           | USER-DEFINED                | YES         | null                     |
| public             | vw_pipeline_detail                       | pic_name                                 | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | pic_email                                | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | pic_phone                                | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | lead_id                                  | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | potential_revenue                        | numeric                     | YES         | null                     |
| public             | vw_pipeline_detail                       | lead_source                              | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | lead_creator_name                        | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | lead_creator_department                  | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | owner_user_id                            | uuid                        | YES         | null                     |
| public             | vw_pipeline_detail                       | owner_name                               | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | owner_email                              | text                        | YES         | null                     |
| public             | vw_pipeline_detail                       | owner_department                         | text                        | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | reason_type                              | USER-DEFINED                | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | count                                    | bigint                      | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | percentage                               | numeric                     | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | avg_competitor_amount                    | numeric                     | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | avg_customer_budget                      | numeric                     | YES         | null                     |
| public             | vw_quotation_rejection_analytics         | month                                    | timestamp with time zone    | YES         | null                     |
| public             | vw_ticket_status_distribution            | status                                   | text                        | YES         | null                     |
| public             | vw_ticket_status_distribution            | ticket_type                              | text                        | YES         | null                     |
| public             | vw_ticket_status_distribution            | count                                    | bigint                      | YES         | null                     |
| public             | vw_ticket_status_distribution            | percentage                               | numeric                     | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | user_id                                  | uuid                        | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | user_name                                | text                        | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | user_role                                | USER-DEFINED                | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | role_category                            | text                        | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | ticket_type                              | text                        | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | tickets_assigned                         | bigint                      | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | assignee_avg_first_response_seconds      | integer                     | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | assignee_avg_resolution_seconds          | integer                     | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | ops_acceptance_rate_percent              | numeric                     | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | performance_score                        | numeric                     | YES         | null                     |
| public             | vw_user_sla_leaderboard                  | department_rank                          | bigint                      | YES         | null                     |
| public             | vw_user_sla_metrics                      | ticket_type                              | text                        | YES         | null                     |
| public             | vw_user_sla_metrics                      | tickets_created                          | bigint                      | YES         | null                     |
| public             | vw_user_sla_metrics                      | tickets_assigned                         | bigint                      | YES         | null                     |
| public             | vw_user_sla_metrics                      | ops_total_costs                          | bigint                      | YES         | null                     |
| public             | vw_user_sla_metrics                      | ops_accepted_costs                       | bigint                      | YES         | null                     |
| public             | vw_user_sla_metrics                      | ops_rejected_costs                       | bigint                      | YES         | null                     |
| realtime           | subscription                             | created_at                               | timestamp without time zone | NO          | null                     |
| storage            | buckets                                  | created_at                               | timestamp with time zone    | YES         | null                     |
| storage            | buckets_analytics                        | created_at                               | timestamp with time zone    | NO          | null                     |
| storage            | buckets_vectors                          | created_at                               | timestamp with time zone    | NO          | null                     |
| storage            | objects                                  | created_at                               | timestamp with time zone    | YES         | null                     |
| storage            | prefixes                                 | created_at                               | timestamp with time zone    | YES         | null                     |
| storage            | s3_multipart_uploads                     | created_at                               | timestamp with time zone    | NO          | null                     |
| storage            | s3_multipart_uploads_parts               | created_at                               | timestamp with time zone    | NO          | null                     |
| storage            | vector_indexes                           | created_at                               | timestamp with time zone    | NO          | null                     |
| vault              | decrypted_secrets                        | created_at                               | timestamp with time zone    | YES         | null                     |
| vault              | secrets                                  | created_at                               | timestamp with time zone    | NO          | null                     |