// =====================================================
// Quality Gates for Growth Insights
// Validates and sanitizes AI-generated insights
// =====================================================

import type { InsightOutput, QualityGateResult, TARGET_KEYWORDS } from '@/types/insights'

// Target-related keywords to block (case insensitive)
const TARGET_KEYWORDS_LIST = [
  'target',
  'quota',
  'achievement',
  'attainment',
  'gap-to-target',
  'target pencapaian',
  'kuota',
  'pencapaian target',
  'goal attainment',
  'sales target',
  'monthly target',
  'quarterly target',
  'annual target',
]

// Regex patterns for target-related content
const TARGET_PATTERNS = [
  /\btarget\b/gi,
  /\bquota\b/gi,
  /\bachievement\b/gi,
  /\battainment\b/gi,
  /gap.?to.?target/gi,
  /\bkuota\b/gi,
  /pencapaian\s+target/gi,
]

/**
 * Gate A: Scope Compliance
 * Validates that output doesn't contain target/quota content
 */
export function validateScopeCompliance(text: string): QualityGateResult {
  const violations: string[] = []

  // Check for target keywords
  for (const keyword of TARGET_KEYWORDS_LIST) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      violations.push(`Contains blocked keyword: "${keyword}"`)
    }
  }

  // Check for target patterns
  for (const pattern of TARGET_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(`Contains blocked pattern: ${pattern.source}`)
    }
    // Reset regex lastIndex
    pattern.lastIndex = 0
  }

  return {
    passed: violations.length === 0,
    violations,
  }
}

/**
 * Gate B: Output Validity
 * Validates that output matches expected schema
 */
export function validateOutputSchema(output: any): QualityGateResult {
  const violations: string[] = []

  // Check required fields
  if (typeof output.executive_summary !== 'string') {
    violations.push('Missing or invalid executive_summary')
  }

  if (!Array.isArray(output.summary_table)) {
    violations.push('Missing or invalid summary_table (must be array)')
  } else {
    // Validate summary table structure
    for (let i = 0; i < output.summary_table.length; i++) {
      const row = output.summary_table[i]
      if (typeof row.metric !== 'string') {
        violations.push(`summary_table[${i}]: missing metric`)
      }
      if (row.current === undefined) {
        violations.push(`summary_table[${i}]: missing current value`)
      }
    }
  }

  if (!Array.isArray(output.key_points)) {
    violations.push('Missing or invalid key_points (must be array)')
  }

  if (!Array.isArray(output.risks)) {
    violations.push('Missing or invalid risks (must be array)')
  }

  if (!Array.isArray(output.mitigations)) {
    violations.push('Missing or invalid mitigations (must be array)')
  }

  if (!Array.isArray(output.recommendations)) {
    violations.push('Missing or invalid recommendations (must be array)')
  } else {
    // Validate recommendations structure
    for (let i = 0; i < output.recommendations.length; i++) {
      const rec = output.recommendations[i]
      if (typeof rec.title !== 'string') {
        violations.push(`recommendations[${i}]: missing title`)
      }
      if (rec.effort && !['low', 'medium', 'high'].includes(rec.effort)) {
        violations.push(`recommendations[${i}]: invalid effort value`)
      }
      if (rec.impact && !['low', 'medium', 'high'].includes(rec.impact)) {
        violations.push(`recommendations[${i}]: invalid impact value`)
      }
    }
  }

  if (!Array.isArray(output.next_steps)) {
    violations.push('Missing or invalid next_steps (must be array)')
  }

  if (!Array.isArray(output.data_gaps)) {
    violations.push('Missing or invalid data_gaps (must be array)')
  }

  return {
    passed: violations.length === 0,
    violations,
  }
}

/**
 * Validate complete insight output
 */
export function validateInsightOutput(output: InsightOutput): QualityGateResult {
  const violations: string[] = []

  // Run schema validation
  const schemaResult = validateOutputSchema(output)
  violations.push(...schemaResult.violations)

  // Run scope compliance check on all text content
  const textContent = extractTextContent(output)
  const scopeResult = validateScopeCompliance(textContent)
  violations.push(...scopeResult.violations)

  return {
    passed: violations.length === 0,
    violations,
  }
}

/**
 * Extract all text content from insight output for validation
 */
function extractTextContent(output: InsightOutput): string {
  const parts: string[] = []

  parts.push(output.executive_summary || '')

  if (output.summary_table) {
    output.summary_table.forEach(row => {
      parts.push(row.metric || '')
      parts.push(String(row.current || ''))
      parts.push(String(row.previous || ''))
      parts.push(row.delta || '')
      parts.push(row.note || '')
    })
  }

  parts.push(...(output.key_points || []))
  parts.push(...(output.risks || []))
  parts.push(...(output.mitigations || []))

  if (output.recommendations) {
    output.recommendations.forEach(rec => {
      parts.push(rec.title || '')
      parts.push(rec.rationale || '')
      parts.push(rec.owner_role || '')
    })
  }

  parts.push(...(output.next_steps || []))
  parts.push(...(output.data_gaps || []))

  return parts.join(' ')
}

/**
 * Sanitize output by removing target-related content
 */
export function sanitizeOutput(output: InsightOutput): InsightOutput {
  const sanitized = { ...output }

  // Sanitize text fields
  sanitized.executive_summary = sanitizeText(output.executive_summary)

  // Sanitize arrays
  sanitized.key_points = (output.key_points || [])
    .map(sanitizeText)
    .filter(text => !containsTargetContent(text))

  sanitized.risks = (output.risks || [])
    .map(sanitizeText)
    .filter(text => !containsTargetContent(text))

  sanitized.mitigations = (output.mitigations || [])
    .map(sanitizeText)
    .filter(text => !containsTargetContent(text))

  sanitized.next_steps = (output.next_steps || [])
    .map(sanitizeText)
    .filter(text => !containsTargetContent(text))

  // Sanitize recommendations
  sanitized.recommendations = (output.recommendations || [])
    .filter(rec => !containsTargetContent(rec.title) && !containsTargetContent(rec.rationale))
    .map(rec => ({
      ...rec,
      title: sanitizeText(rec.title),
      rationale: sanitizeText(rec.rationale),
    }))

  // Sanitize summary table
  sanitized.summary_table = (output.summary_table || [])
    .filter(row => !containsTargetContent(row.metric))
    .map(row => ({
      ...row,
      metric: sanitizeText(row.metric),
      note: row.note ? sanitizeText(row.note) : null,
    }))

  // Add note about sanitization if any target content was found
  const originalText = extractTextContent(output)
  if (containsTargetContent(originalText)) {
    sanitized.data_gaps = [
      ...(sanitized.data_gaps || []),
      'Out of scope: target achievement analysis is available in a separate module.',
    ]
  }

  return sanitized
}

/**
 * Check if text contains target-related content
 */
function containsTargetContent(text: string): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()

  for (const keyword of TARGET_KEYWORDS_LIST) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return true
    }
  }

  for (const pattern of TARGET_PATTERNS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0
      return true
    }
  }

  return false
}

/**
 * Sanitize individual text by replacing target keywords
 */
function sanitizeText(text: string): string {
  if (!text) return ''

  let sanitized = text

  // Replace target keywords with generic terms
  const replacements: [RegExp, string][] = [
    [/\btarget(s)?\b/gi, 'goal$1'],
    [/\bquota(s)?\b/gi, 'benchmark$1'],
    [/\bachievement\b/gi, 'performance'],
    [/\battainment\b/gi, 'progress'],
    [/gap.?to.?target/gi, 'performance gap'],
    [/pencapaian\s+target/gi, 'kemajuan'],
    [/\bkuota\b/gi, 'standar'],
  ]

  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  return sanitized
}

/**
 * Out of scope message for target requests
 */
export const OUT_OF_SCOPE_MESSAGE = 'Out of scope: target achievement analysis is available in a separate module.'
