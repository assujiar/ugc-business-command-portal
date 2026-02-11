// Shared date-range helper for marketing API routes
// Supports: 7d, 30d, 90d, ytd, custom (with date_from/date_to)

export function parseDateRange(searchParams: URLSearchParams, opts?: { gscDelay?: boolean }) {
  const range = searchParams.get('range') || '30d'
  const now = new Date()
  const delay = opts?.gscDelay ? 3 : 1

  let endDate: Date
  let startDate: Date

  if (range === 'custom') {
    const df = searchParams.get('date_from')
    const dt = searchParams.get('date_to')
    startDate = df ? new Date(df + 'T00:00:00') : new Date(2025, 0, 1)
    endDate = dt ? new Date(dt + 'T00:00:00') : new Date(now)
  } else {
    endDate = new Date(now)
    endDate.setDate(endDate.getDate() - delay)

    if (range === 'ytd') {
      startDate = new Date(now.getFullYear(), 0, 1)
    } else {
      const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
      startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - days)
    }
  }

  const startStr = startDate.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  // Previous period (same length)
  const periodMs = endDate.getTime() - startDate.getTime()
  const periodDays = Math.ceil(periodMs / (1000 * 60 * 60 * 24))
  const prevEndDate = new Date(startDate)
  prevEndDate.setDate(prevEndDate.getDate() - 1)
  const prevStartDate = new Date(prevEndDate)
  prevStartDate.setDate(prevStartDate.getDate() - periodDays)
  const prevStartStr = prevStartDate.toISOString().split('T')[0]
  const prevEndStr = prevEndDate.toISOString().split('T')[0]

  // YoY: Same period last year
  const yoyStartDate = new Date(startDate)
  yoyStartDate.setFullYear(yoyStartDate.getFullYear() - 1)
  const yoyEndDate = new Date(endDate)
  yoyEndDate.setFullYear(yoyEndDate.getFullYear() - 1)
  const yoyStartStr = yoyStartDate.toISOString().split('T')[0]
  const yoyEndStr = yoyEndDate.toISOString().split('T')[0]

  return {
    range, startStr, endStr, prevStartStr, prevEndStr,
    yoyStartStr, yoyEndStr, periodDays,
    startDate, endDate,
  }
}
