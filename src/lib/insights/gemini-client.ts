// =====================================================
// Gemini AI Client for Growth Insights
// Generates structured insights using Gemini API
// Optimized for UGC Logistics (PT Utama Globalindo Cargo)
// =====================================================

import type { GrowthSnapshot, InsightOutput } from '@/types/insights'
import { validateInsightOutput, sanitizeOutput } from './quality-gates'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

interface GenerateInsightResult {
  insight: InsightOutput
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

// System instruction for UGC Logistics growth analysis
const SYSTEM_INSTRUCTION = `Anda adalah Growth Analyst untuk UGC Logistics (PT Utama Globalindo Cargo).

KONTEKS BISNIS:
UGC Logistics adalah perusahaan cargo/logistics (freight forwarder) yang growth-nya terutama ditentukan oleh:
- Kecepatan & kualitas proses quoting (response time, quote accuracy, competitiveness)
- Conversion quote → booking
- Repeat shipment & account expansion (upsell/cross-sell)
- Lane/route mix & product mix (air/sea/land, domestic/international) jika datanya ada
- Reliability & service recovery (ticketing/complaint/late shipment) sebagai faktor retention jika datanya ada

ATURAN KETAT:
1. GROWTH-ONLY ANALYSIS: Fokus pada growth trends, conversion rates, pipeline health, dan performance patterns untuk bisnis freight forwarding/cargo.
2. ABSOLUTELY NO TARGET/QUOTA DISCUSSION: DILARANG membahas target, quota, achievement, attainment, atau gap-to-target. Ini OUT OF SCOPE. Jika diminta, jawab: "Out of scope: target achievement ada di modul terpisah."
3. USE ONLY PROVIDED DATA: Base semua insight HANYA pada metrics dan examples yang diberikan. JANGAN mengarang atau mengasumsikan data.
4. RETURN VALID JSON ONLY: Response HARUS valid JSON object sesuai schema. Tidak boleh ada markdown atau teks di luar JSON.

ISTILAH LOGISTICS:
- Quote: Penawaran harga/layanan untuk pengiriman
- Booking: Order/konfirmasi pengiriman setelah quote disetujui
- Shipment: Pengiriman aktual (AWB/BL/DO)
- Lane: Rute/koridor pengiriman (origin-destination)
- Service level: Kecepatan/ketepatan (SLA), on-time performance
- Exception: Keterlambatan, damage, customs hold, dsb
- Account expansion: Naiknya frekuensi/volume shipment dari account existing
- Stalled deal: Pipeline yang tidak bergerak, biasanya karena pricing mismatch, approval lambat, info kurang lengkap, atau follow-up bolong
- Lead: Calon customer yang masuk dari berbagai channel
- Opportunity: Pipeline aktif dengan potensi revenue
- Activity: Interaksi sales dengan customer (call, email, meeting, site visit)
- Sales Plan: Rencana approach untuk account (hunting/maintenance/winback)

PRIORITAS GROWTH (UGC Logistics):
1. Speed of response (quote turnaround time)
2. Quote quality & competitiveness
3. Follow-up discipline & cadence
4. Stage hygiene (pipeline tidak boleh stuck)
5. Repeat shipment & account expansion

TUGAS ANDA:
Buat Growth Insight report untuk bisnis cargo/logistics, fokus pada:
- Quote→booking conversion (tercermin dari lead→opportunity→closed won)
- Response time & follow-up latency
- Pipeline velocity/stage aging
- Source/channel quality (bukan sekadar volume)
- Repeat & expansion account (jika ada)
- Reliability/ticket impact pada retention (jika ada)

OWNER ROLE MAPPING UGC:
- Salesperson: follow-up, qualification, pipeline hygiene, closing actions
- Sales Manager: coaching, stage governance, SLA follow-up tim, realloc hot leads, approval bottleneck
- Marketing Manager: source quality, campaign refinement, lead routing speed, nurture
- MACX: marketing analytics, source effectiveness analysis
- Ops: pickup/dispatch readiness, exception handling, SLA reliability input ke sales
- Director: pricing policy guardrails, resource allocation, cross-function blockers

SETIAP RECOMMENDATION WAJIB PUNYA:
- title: judul tindakan
- rationale: alasan berbasis metrik snapshot
- owner_role: siapa yang eksekusi (Salesperson / Sales Manager / Marketing Manager / MACX / Ops / Director)
- effort: low/medium/high
- impact: low/medium/high

DATA GAPS PRIORITY:
Jika data berikut tidak tersedia, tulis di data_gaps sebagai prioritas instrumentasi:
1. quote_created_at, quote_sent_at, quote_value, quote_status
2. booking_created_at, booking_value, booking_source
3. shipment_count, shipment_value, gross_profit/margin per shipment
4. lane (origin, destination), product_type (air/sea/land), service_level
5. ticket_count, reason, resolution_time

PIPELINE INTERPRETATION:
- Pipeline tua/stuck biasanya berarti: pricing mismatch, approval lambat, info shipment kurang lengkap, atau follow-up bolong
- Source volume besar tapi conversion jelek = buang waktu; prioritaskan source yang menghasilkan booking
- Win rate rendah bisa indikasi: pricing tidak kompetitif, sales cycle terlalu lama, atau qualification awal kurang ketat

Semua monetary values harus dalam format Indonesian Rupiah (Rp) dengan abbreviation (K, M, B).`

// Output schema definition
const OUTPUT_SCHEMA = `{
  "executive_summary": "2-3 kalimat summary performa growth secara keseluruhan dalam konteks cargo/logistics",
  "summary_table": [
    {
      "metric": "Nama metric",
      "current": "Nilai saat ini",
      "previous": "Nilai periode sebelumnya atau null",
      "delta": "Perubahan (+X% atau -X%) atau null",
      "note": "Insight singkat atau null"
    }
  ],
  "key_points": ["Temuan positif 1", "Temuan positif 2"],
  "risks": ["Risiko 1", "Risiko 2"],
  "mitigations": ["Mitigasi untuk risiko 1", "Mitigasi untuk risiko 2"],
  "recommendations": [
    {
      "title": "Judul rekomendasi",
      "rationale": "Alasan berbasis metrik snapshot",
      "effort": "low|medium|high",
      "impact": "low|medium|high",
      "owner_role": "Salesperson|Sales Manager|Marketing Manager|MACX|Ops|Director"
    }
  ],
  "next_steps": ["Tindakan segera 1", "Tindakan segera 2"],
  "data_gaps": ["Data yang tidak tersedia 1", "Limitasi 2"]
}`

/**
 * Generate growth insights using Gemini API
 */
export async function generateInsight(
  snapshot: GrowthSnapshot,
  apiKey: string,
  retryCount = 0
): Promise<GenerateInsightResult> {
  const startTime = Date.now()

  // Build the user prompt with snapshot data
  const userPrompt = buildUserPrompt(snapshot)

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM_INSTRUCTION}\n\nOUTPUT FORMAT (return ONLY this JSON structure):\n${OUTPUT_SCHEMA}\n\nANALYZE THIS DATA:\n${userPrompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data: GeminiResponse = await response.json()
    const latencyMs = Date.now() - startTime

    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error('No text in Gemini response')
    }

    // Parse JSON response
    let insight: InsightOutput
    try {
      insight = JSON.parse(text)
    } catch (parseError) {
      // If JSON parsing fails, retry once with correction prompt
      if (retryCount === 0) {
        console.warn('JSON parse failed, retrying with correction prompt')
        return generateInsightWithCorrection(snapshot, text, apiKey)
      }
      throw new Error(`Failed to parse Gemini response as JSON: ${parseError}`)
    }

    // Validate and sanitize output
    const validationResult = validateInsightOutput(insight)
    if (!validationResult.passed) {
      // Sanitize to remove any target-related content
      insight = sanitizeOutput(insight)
    }

    // Ensure all required fields exist
    insight = ensureRequiredFields(insight)

    return {
      insight,
      tokensIn: data.usageMetadata?.promptTokenCount || 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
      latencyMs,
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime

    // If this is first attempt, retry once
    if (retryCount === 0 && error instanceof Error) {
      console.warn(`Gemini request failed, retrying: ${error.message}`)
      return generateInsight(snapshot, apiKey, 1)
    }

    // Return fallback insight
    return {
      insight: createFallbackInsight(snapshot, error instanceof Error ? error.message : 'Unknown error'),
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
    }
  }
}

/**
 * Retry with a correction prompt when JSON parsing fails
 */
async function generateInsightWithCorrection(
  snapshot: GrowthSnapshot,
  invalidResponse: string,
  apiKey: string
): Promise<GenerateInsightResult> {
  const startTime = Date.now()

  const correctionPrompt = `Your previous response was not valid JSON. Please return ONLY a valid JSON object with no additional text or markdown.

Previous invalid response (DO NOT use this format):
${invalidResponse.substring(0, 500)}...

Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Original data to analyze:
${JSON.stringify(snapshot.metrics, null, 2)}`

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: correctionPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`Gemini correction API error: ${response.status}`)
    }

    const data: GeminiResponse = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('No text in correction response')
    }

    const insight = JSON.parse(text)
    const latencyMs = Date.now() - startTime

    return {
      insight: ensureRequiredFields(sanitizeOutput(insight)),
      tokensIn: data.usageMetadata?.promptTokenCount || 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
      latencyMs,
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    return {
      insight: createFallbackInsight(snapshot, 'JSON parsing failed after retry'),
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
    }
  }
}

/**
 * Build user prompt from snapshot data
 */
function buildUserPrompt(snapshot: GrowthSnapshot): string {
  const { context, metrics, examples, data_quality_flags, prev_period } = snapshot

  let prompt = `## Filter Aktif
- Period: ${context.startDate || 'All time'} s/d ${context.endDate || 'Present'}
- Scope: ${context.scope_type}
- Role View: ${context.role_view}
- Salesperson/Team Filter: ${context.filters?.salespersonId || 'null'}
- Channel/Source Filter: ${context.filters?.source || 'null'}

## Current Period Metrics (CRM Data)
${JSON.stringify(metrics, null, 2)}

`

  if (prev_period) {
    prompt += `## Previous Period Metrics (untuk perbandingan)
${JSON.stringify(prev_period.metrics, null, 2)}

`
  }

  if (examples.top_5_biggest_open_deals?.length) {
    prompt += `## Top Open Deals (by estimated value)
${JSON.stringify(examples.top_5_biggest_open_deals, null, 2)}

`
  }

  if (examples.top_5_oldest_stuck_deals?.length) {
    prompt += `## Stalled Deals (perlu perhatian - tidak ada aktivitas >7 hari)
${JSON.stringify(examples.top_5_oldest_stuck_deals, null, 2)}

`
  }

  if (examples.top_5_accounts_by_recent_activity?.length) {
    prompt += `## Most Active Accounts
${JSON.stringify(examples.top_5_accounts_by_recent_activity, null, 2)}

`
  }

  if (data_quality_flags.length > 0) {
    prompt += `## Data Quality Notes
${data_quality_flags.map(f => `- ${f}`).join('\n')}
`
  }

  prompt += `
## Catatan Penting
- Data di atas dari CRM module (leads, opportunities, activities, accounts)
- Data quote/booking/shipment spesifik belum terinstrumentasi di CRM - rekomendasikan instrumentasi jika perlu
- Fokus analisis pada: pipeline velocity, conversion, follow-up discipline, source quality
- DILARANG membahas target/quota/attainment - out of scope
`

  return prompt
}

/**
 * Ensure all required fields exist in the insight output
 */
function ensureRequiredFields(insight: Partial<InsightOutput>): InsightOutput {
  return {
    executive_summary: insight.executive_summary || 'Unable to generate summary due to insufficient data.',
    summary_table: insight.summary_table || [],
    key_points: insight.key_points || [],
    risks: insight.risks || [],
    mitigations: insight.mitigations || [],
    recommendations: insight.recommendations || [],
    next_steps: insight.next_steps || [],
    data_gaps: insight.data_gaps || ['Unable to fully analyze due to data limitations'],
  }
}

/**
 * Create a fallback insight when AI generation fails
 */
function createFallbackInsight(snapshot: GrowthSnapshot, errorMessage: string): InsightOutput {
  const metrics = snapshot.metrics

  return {
    executive_summary: 'Unable to generate AI insight at this time. Please try again later.',
    summary_table: [
      {
        metric: 'Leads Masuk',
        current: metrics.leads_in?.toString() || '0',
        previous: null,
        delta: null,
        note: 'Total leads dalam periode',
      },
      {
        metric: 'Opportunities Created',
        current: metrics.opps_created?.toString() || '0',
        previous: null,
        delta: null,
        note: 'Pipeline baru',
      },
      {
        metric: 'Pipeline Value',
        current: formatCurrency(metrics.pipeline_open_value || 0),
        previous: null,
        delta: null,
        note: 'Nilai pipeline aktif',
      },
      {
        metric: 'Win Rate',
        current: metrics.opp_to_win_rate ? `${metrics.opp_to_win_rate}%` : 'N/A',
        previous: null,
        delta: null,
        note: 'Conversion closed won/lost',
      },
      {
        metric: 'Stalled Deals',
        current: metrics.stalled_opps_count?.toString() || '0',
        previous: null,
        delta: null,
        note: 'Pipeline tidak bergerak >7 hari',
      },
    ],
    key_points: ['Data CRM tersedia dan siap dianalisis'],
    risks: [],
    mitigations: [],
    recommendations: [],
    next_steps: ['Coba generate insight lagi saat service tersedia'],
    data_gaps: [
      `AI generation error: ${errorMessage}`,
      'Quote/booking/shipment data belum terinstrumentasi di CRM',
      ...snapshot.data_quality_flags,
    ],
  }
}

/**
 * Format currency in Indonesian Rupiah
 */
function formatCurrency(value: number): string {
  if (value >= 1000000000) {
    return `Rp ${(value / 1000000000).toFixed(1)}B`
  }
  if (value >= 1000000) {
    return `Rp ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `Rp ${(value / 1000).toFixed(1)}K`
  }
  return `Rp ${value.toLocaleString('id-ID')}`
}
