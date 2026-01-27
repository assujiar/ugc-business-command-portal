#!/bin/bash
# ============================================
# Script: scan_code_references.sh
#
# PURPOSE: Scan codebase for table/function references
# This helps identify which DB objects are used by the application
#
# USAGE: ./scan_code_references.sh > code_references.txt
# ============================================

echo "============================================"
echo "CODE REFERENCE SCAN"
echo "Date: $(date)"
echo "============================================"
echo ""

# Change to repo root
cd "$(dirname "$0")/../.." || exit 1

echo "Working directory: $(pwd)"
echo ""

# ============================================
# 1. TABLES REFERENCED IN CODE
# ============================================

echo "============================================"
echo "1. TABLES REFERENCED IN SOURCE CODE"
echo "============================================"
echo ""

# Common table names to check
TABLES=(
    "profiles"
    "accounts"
    "contacts"
    "leads"
    "opportunities"
    "opportunity_stage_history"
    "activities"
    "pipeline_updates"
    "sales_plans"
    "sales_plan_items"
    "tickets"
    "ticket_comments"
    "ticket_events"
    "ticket_attachments"
    "ticket_rate_quotes"
    "ticket_rate_quote_items"
    "ticket_sla_tracking"
    "ticket_response_exchanges"
    "ticket_response_metrics"
    "customer_quotations"
    "customer_quotation_items"
    "customer_quotation_terms"
    "lead_handover_pool"
    "lead_bids"
    "departments"
    "ticket_categories"
    "sla_business_hours"
    "sla_holidays"
    "operational_cost_rejection_reasons"
)

echo "Table,Found In Files"
for table in "${TABLES[@]}"; do
    files=$(grep -rl "$table" src/ 2>/dev/null | head -5 | tr '\n' ' ')
    if [ -n "$files" ]; then
        echo "$table,\"$files\""
    fi
done

echo ""
echo "============================================"
echo "2. RPC FUNCTIONS CALLED FROM CODE"
echo "============================================"
echo ""

# Look for .rpc() calls
echo "RPC calls found in src/:"
grep -rn "\.rpc\s*(" src/ 2>/dev/null | grep -v node_modules | head -50

echo ""
echo "============================================"
echo "3. TABLE REFERENCES IN API ROUTES"
echo "============================================"
echo ""

# Look for .from() calls (Supabase table access)
echo "Table access patterns (.from()) in API routes:"
grep -rn "\.from\s*(" src/app/api/ 2>/dev/null | grep -v node_modules | head -50

echo ""
echo "============================================"
echo "4. MIGRATION FILES REFERENCING OBJECTS"
echo "============================================"
echo ""

echo "Tables created in migrations:"
grep -h "CREATE TABLE" supabase/migrations/*.sql 2>/dev/null | \
    sed 's/.*CREATE TABLE.*public\.\([a-z_]*\).*/\1/' | \
    sort -u | head -50

echo ""
echo "Functions created in migrations:"
grep -h "CREATE.*FUNCTION.*public\." supabase/migrations/*.sql 2>/dev/null | \
    sed 's/.*FUNCTION.*public\.\([a-z_]*\).*/\1/' | \
    sort -u | head -50

echo ""
echo "============================================"
echo "5. OBJECTS NOT FOUND IN CODE"
echo "============================================"
echo ""

echo "Checking for objects that may be unused..."

# Check each table
echo ""
echo "Tables with NO src/ references:"
for table in "${TABLES[@]}"; do
    count=$(grep -r "$table" src/ 2>/dev/null | wc -l)
    if [ "$count" -eq 0 ]; then
        echo "  - $table (0 references in src/)"
    fi
done

echo ""
echo "============================================"
echo "SCAN COMPLETE"
echo "============================================"
