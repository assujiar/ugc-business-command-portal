// =====================================================
// CRM Email Templates
// HTML templates for various CRM notifications
// Casual tone for operational emails, formal for reports
// =====================================================

// Brand colors from UGC Logistics
const BRAND_COLOR = '#FF4600'
const BRAND_COLOR_DARK = '#CC3800'
const TEXT_COLOR = '#333333'
const TEXT_MUTED = '#666666'
const BORDER_COLOR = '#E5E5E5'
const BG_LIGHT = '#F9FAFB'

// Base email wrapper
function emailWrapper(content: string, isFormals: boolean = false): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRM UGC Logistics</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${BG_LIGHT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${BG_LIGHT};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${BRAND_COLOR}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                CRM UGC Logistics
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: ${BG_LIGHT}; border-radius: 0 0 8px 8px; border-top: 1px solid ${BORDER_COLOR};">
              <p style="margin: 0; color: ${TEXT_MUTED}; font-size: 12px; text-align: center;">
                Email ini dikirim secara otomatis oleh sistem CRM UGC Logistics.<br>
                Mohon tidak membalas email ini langsung.
              </p>
              <p style="margin: 12px 0 0 0; color: ${TEXT_MUTED}; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} UGC Logistics. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Button component
function buttonComponent(text: string, url: string, isPrimary: boolean = true): string {
  const bgColor = isPrimary ? BRAND_COLOR : '#ffffff'
  const textColor = isPrimary ? '#ffffff' : BRAND_COLOR
  const border = isPrimary ? 'none' : `2px solid ${BRAND_COLOR}`

  return `
    <a href="${url}" style="display: inline-block; padding: 14px 28px; background-color: ${bgColor}; color: ${textColor}; text-decoration: none; border-radius: 6px; font-weight: 600; border: ${border}; margin: 8px 4px;">
      ${text}
    </a>
  `
}

// Info card component
function infoCard(title: string, items: { label: string; value: string }[]): string {
  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 12px; color: ${TEXT_MUTED}; font-size: 14px; border-bottom: 1px solid ${BORDER_COLOR}; width: 140px;">
          ${item.label}
        </td>
        <td style="padding: 8px 12px; color: ${TEXT_COLOR}; font-size: 14px; border-bottom: 1px solid ${BORDER_COLOR};">
          ${item.value || '-'}
        </td>
      </tr>
    `
    )
    .join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${BG_LIGHT}; border-radius: 8px; margin: 16px 0;">
      <tr>
        <td colspan="2" style="padding: 12px 16px; background-color: ${BRAND_COLOR}; color: #ffffff; font-weight: 600; border-radius: 8px 8px 0 0;">
          ${title}
        </td>
      </tr>
      ${itemsHtml}
    </table>
  `
}

// =====================================================
// Template: New Lead Assignment
// Tone: Casual & Exciting
// =====================================================
export interface NewLeadEmailData {
  companyName: string
  picName: string | null
  picEmail: string | null
  picPhone: string | null
  source: string
  industry: string | null
  inquiryText: string | null
  priority: number
  handoverNotes: string | null
  handoverByName: string
  leadId: string
  appUrl: string
}

export function newLeadEmailTemplate(data: NewLeadEmailData): { subject: string; html: string } {
  const priorityLabel = data.priority === 1 ? 'Tinggi' : data.priority === 2 ? 'Sedang' : 'Normal'
  const priorityColor = data.priority === 1 ? '#DC2626' : data.priority === 2 ? '#F59E0B' : '#10B981'

  const content = `
    <h2 style="margin: 0 0 16px 0; color: ${TEXT_COLOR}; font-size: 20px;">
      Hey Tim Sales! Ada Lead Baru Nih! 🎉
    </h2>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 16px; line-height: 1.6;">
      Kabar gembira! <strong>${data.handoverByName}</strong> baru saja menyerahkan lead baru ke pool sales.
      Yuk langsung cek dan claim sebelum direbut yang lain!
    </p>

    <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: #92400E; font-size: 14px;">
        <strong>⚡ Tips:</strong> Lead ini bersifat first come first served. Jangan sampai kelewatan ya!
      </p>
    </div>

    ${infoCard('Detail Lead', [
      { label: 'Perusahaan', value: data.companyName },
      { label: 'Nama PIC', value: data.picName || '-' },
      { label: 'Email', value: data.picEmail || '-' },
      { label: 'Telepon', value: data.picPhone || '-' },
      { label: 'Sumber Lead', value: data.source },
      { label: 'Industri', value: data.industry || '-' },
      { label: 'Prioritas', value: `<span style="color: ${priorityColor}; font-weight: 600;">${priorityLabel}</span>` },
    ])}

    ${data.inquiryText ? `
      <div style="margin: 24px 0;">
        <h3 style="margin: 0 0 8px 0; color: ${TEXT_COLOR}; font-size: 16px;">Kebutuhan/Inquiry:</h3>
        <p style="margin: 0; padding: 12px 16px; background-color: ${BG_LIGHT}; border-radius: 4px; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.6;">
          ${data.inquiryText}
        </p>
      </div>
    ` : ''}

    ${data.handoverNotes ? `
      <div style="margin: 24px 0;">
        <h3 style="margin: 0 0 8px 0; color: ${TEXT_COLOR}; font-size: 16px;">Catatan Handover:</h3>
        <p style="margin: 0; padding: 12px 16px; background-color: ${BG_LIGHT}; border-radius: 4px; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.6;">
          ${data.handoverNotes}
        </p>
      </div>
    ` : ''}

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('🚀 Klaim Lead Sekarang!', `${data.appUrl}/crm/sales-inbox`)}
    </div>

    <p style="margin: 24px 0 0 0; color: ${TEXT_MUTED}; font-size: 14px; text-align: center;">
      Semangat closing! 💪
    </p>
  `

  return {
    subject: `🔥 Lead Baru Tersedia: ${data.companyName} - Segera Klaim!`,
    html: emailWrapper(content),
  }
}

// =====================================================
// Template: Unclaimed Lead Reminder
// Tone: Urgent & Encouraging
// =====================================================
export interface UnclaimedLeadEmailData {
  companyName: string
  picName: string | null
  picEmail: string | null
  picPhone: string | null
  source: string
  hoursUnclaimed: number
  handoverByName: string
  leadId: string
  appUrl: string
}

export function unclaimedLeadReminderTemplate(data: UnclaimedLeadEmailData): { subject: string; html: string } {
  const urgencyLevel = data.hoursUnclaimed >= 48 ? 'critical' : data.hoursUnclaimed >= 24 ? 'high' : 'medium'
  const urgencyColor = urgencyLevel === 'critical' ? '#DC2626' : urgencyLevel === 'high' ? '#F59E0B' : '#3B82F6'
  const urgencyEmoji = urgencyLevel === 'critical' ? '🚨' : urgencyLevel === 'high' ? '⚠️' : '⏰'

  const content = `
    <h2 style="margin: 0 0 16px 0; color: ${urgencyColor}; font-size: 20px;">
      ${urgencyEmoji} Reminder: Lead Belum Diklaim - ${data.hoursUnclaimed} Jam!
    </h2>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 16px; line-height: 1.6;">
      Halo Tim Sales! Lead dari <strong>${data.companyName}</strong> sudah menunggu
      <strong style="color: ${urgencyColor};">${data.hoursUnclaimed} jam</strong> di pool dan belum ada yang claim.
      ${data.hoursUnclaimed >= 48
        ? 'Ini sudah hampir 2 hari lho! Potensi revenue bisa hilang kalau tidak segera di-follow up.'
        : 'Jangan sampai potensi revenue ini terlewat ya!'}
    </p>

    <div style="background-color: ${urgencyLevel === 'critical' ? '#FEE2E2' : '#FEF3C7'}; border-left: 4px solid ${urgencyColor}; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: ${urgencyLevel === 'critical' ? '#991B1B' : '#92400E'}; font-size: 14px;">
        <strong>Reminder ke-${Math.floor(data.hoursUnclaimed / 4)}:</strong>
        ${data.hoursUnclaimed >= 72
          ? 'Lead ini sudah 3 hari! Segera ambil tindakan sebelum terlambat.'
          : data.hoursUnclaimed >= 48
            ? 'Prospek mungkin sudah mencari vendor lain. Ayo buruan!'
            : 'Semakin cepat di-follow up, semakin besar peluang closing!'}
      </p>
    </div>

    ${infoCard('Detail Lead', [
      { label: 'Perusahaan', value: data.companyName },
      { label: 'Nama PIC', value: data.picName || '-' },
      { label: 'Email', value: data.picEmail || '-' },
      { label: 'Telepon', value: data.picPhone || '-' },
      { label: 'Sumber Lead', value: data.source },
      { label: 'Diserahkan oleh', value: data.handoverByName },
      { label: 'Lama Menunggu', value: `<span style="color: ${urgencyColor}; font-weight: 600;">${data.hoursUnclaimed} jam</span>` },
    ])}

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('💨 Klaim & Follow Up Sekarang!', `${data.appUrl}/crm/sales-inbox`)}
    </div>

    <p style="margin: 24px 0 0 0; color: ${TEXT_MUTED}; font-size: 14px; text-align: center;">
      Setiap lead adalah peluang. Let's go! 🎯
    </p>
  `

  return {
    subject: `${urgencyEmoji} Reminder: Lead ${data.companyName} Sudah ${data.hoursUnclaimed} Jam Belum Diklaim!`,
    html: emailWrapper(content),
  }
}

// =====================================================
// Template: Pipeline Due Date Reminder
// Tone: Helpful & Motivating
// =====================================================
export interface PipelineDueReminderData {
  opportunityName: string
  accountName: string
  stage: string
  nextStep: string | null
  dueDate: string
  hoursRemaining: number
  estimatedValue: number | null
  currency: string
  opportunityId: string
  appUrl: string
}

export function pipelineDueReminderTemplate(data: PipelineDueReminderData): { subject: string; html: string } {
  const urgencyEmoji = data.hoursRemaining <= 4 ? '🔴' : data.hoursRemaining <= 12 ? '🟡' : '🟢'
  const timeText = data.hoursRemaining <= 4 ? '4 jam lagi' : data.hoursRemaining <= 12 ? '12 jam lagi' : '24 jam lagi'

  const formattedValue = data.estimatedValue
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: data.currency }).format(data.estimatedValue)
    : '-'

  const content = `
    <h2 style="margin: 0 0 16px 0; color: ${TEXT_COLOR}; font-size: 20px;">
      ${urgencyEmoji} Reminder: Pipeline Due Date ${timeText}
    </h2>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 16px; line-height: 1.6;">
      Halo! Ini pengingat bahwa ada tahapan pipeline yang akan jatuh tempo dalam
      <strong>${timeText}</strong>. Yuk pastikan kamu sudah siap untuk langkah selanjutnya!
    </p>

    ${infoCard('Detail Opportunity', [
      { label: 'Nama Opportunity', value: data.opportunityName },
      { label: 'Perusahaan', value: data.accountName },
      { label: 'Stage Saat Ini', value: data.stage },
      { label: 'Langkah Selanjutnya', value: data.nextStep || '-' },
      { label: 'Due Date', value: data.dueDate },
      { label: 'Estimasi Nilai', value: formattedValue },
    ])}

    <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 12px 16px; margin: 24px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: #1E40AF; font-size: 14px;">
        <strong>💡 Tips:</strong> Persiapkan materi presentasi, quotation, atau dokumen pendukung lainnya
        sebelum meeting dengan klien. Persiapan yang matang = peluang closing lebih besar!
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('📋 Lihat Detail Pipeline', `${data.appUrl}/crm/pipeline/${data.opportunityId}`)}
    </div>

    <p style="margin: 24px 0 0 0; color: ${TEXT_MUTED}; font-size: 14px; text-align: center;">
      Semoga lancar dan sukses! 🌟
    </p>
  `

  return {
    subject: `${urgencyEmoji} Reminder: ${data.opportunityName} - Due Date ${timeText}`,
    html: emailWrapper(content),
  }
}

// =====================================================
// Template: Pipeline Overdue Reminder
// Tone: Urgent but Supportive
// =====================================================
export interface PipelineOverdueData {
  opportunityName: string
  accountName: string
  stage: string
  nextStep: string | null
  dueDate: string
  hoursOverdue: number
  estimatedValue: number | null
  currency: string
  opportunityId: string
  appUrl: string
}

export function pipelineOverdueTemplate(data: PipelineOverdueData): { subject: string; html: string } {
  const urgencyLevel = data.hoursOverdue >= 24 ? 'critical' : data.hoursOverdue >= 12 ? 'high' : 'medium'
  const urgencyColor = urgencyLevel === 'critical' ? '#DC2626' : urgencyLevel === 'high' ? '#F59E0B' : '#3B82F6'
  const urgencyEmoji = urgencyLevel === 'critical' ? '🚨' : urgencyLevel === 'high' ? '⚠️' : '⏰'

  const formattedValue = data.estimatedValue
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: data.currency }).format(data.estimatedValue)
    : '-'

  const content = `
    <h2 style="margin: 0 0 16px 0; color: ${urgencyColor}; font-size: 20px;">
      ${urgencyEmoji} Overdue: Stage Pipeline Belum Di-Update!
    </h2>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 16px; line-height: 1.6;">
      Halo! Pipeline <strong>${data.opportunityName}</strong> sudah melewati due date
      <strong style="color: ${urgencyColor};">${data.hoursOverdue} jam</strong> yang lalu dan belum ada update.
      ${data.hoursOverdue >= 24
        ? 'Ini sudah lebih dari 1 hari! Mohon segera update progress atau ubah due date jika diperlukan.'
        : 'Yuk segera update status agar pipeline tetap on track!'}
    </p>

    <div style="background-color: ${urgencyLevel === 'critical' ? '#FEE2E2' : '#FEF3C7'}; border-left: 4px solid ${urgencyColor}; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: ${urgencyLevel === 'critical' ? '#991B1B' : '#92400E'}; font-size: 14px;">
        <strong>Perhatian:</strong>
        ${data.hoursOverdue >= 24
          ? 'Update pipeline yang terlambat dapat mempengaruhi forecast dan perencanaan tim.'
          : 'Jangan lupa update pipeline agar data tetap akurat untuk tim.'}
      </p>
    </div>

    ${infoCard('Detail Pipeline yang Overdue', [
      { label: 'Nama Opportunity', value: data.opportunityName },
      { label: 'Perusahaan', value: data.accountName },
      { label: 'Stage Saat Ini', value: data.stage },
      { label: 'Langkah Selanjutnya', value: data.nextStep || '-' },
      { label: 'Due Date', value: data.dueDate },
      { label: 'Terlambat', value: `<span style="color: ${urgencyColor}; font-weight: 600;">${data.hoursOverdue} jam</span>` },
      { label: 'Estimasi Nilai', value: formattedValue },
    ])}

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('✏️ Update Pipeline Sekarang', `${data.appUrl}/crm/pipeline/${data.opportunityId}`)}
    </div>

    <p style="margin: 24px 0 0 0; color: ${TEXT_MUTED}; font-size: 14px; text-align: center;">
      Keep up the good work! 💪
    </p>
  `

  return {
    subject: `${urgencyEmoji} Overdue ${data.hoursOverdue}jam: ${data.opportunityName} - Segera Update!`,
    html: emailWrapper(content),
  }
}

// =====================================================
// Template: Sales Inactivity Reminder
// Tone: Encouraging & Motivating
// =====================================================
export interface SalesInactivityData {
  salesName: string
  lastActivityDate: string
  lastActivityType: string | null
  daysSinceLastActivity: number
  appUrl: string
}

export function salesInactivityTemplate(data: SalesInactivityData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 16px 0; color: ${TEXT_COLOR}; font-size: 20px;">
      Hey ${data.salesName}! Sudah 2 Hari Nih... 📅
    </h2>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 16px; line-height: 1.6;">
      Kami notice belum ada aktivitas sales baru dari kamu dalam
      <strong>${data.daysSinceLastActivity} hari</strong> terakhir.
      ${data.lastActivityType
        ? `Aktivitas terakhir kamu adalah <strong>${data.lastActivityType}</strong> pada ${data.lastActivityDate}.`
        : `Aktivitas terakhir tercatat pada ${data.lastActivityDate}.`}
    </p>

    <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: #1E40AF; font-size: 14px;">
        <strong>💡 Ingat:</strong> Konsistensi adalah kunci sukses sales!
        Setiap call, visit, atau email yang kamu lakukan adalah langkah menuju closing.
      </p>
    </div>

    <div style="margin: 24px 0;">
      <h3 style="margin: 0 0 12px 0; color: ${TEXT_COLOR}; font-size: 16px;">Ide Aktivitas Hari Ini:</h3>
      <ul style="margin: 0; padding: 0 0 0 20px; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.8;">
        <li>Follow up lead yang belum di-contact</li>
        <li>Check pipeline yang perlu di-update</li>
        <li>Kirim email ke prospek potensial</li>
        <li>Jadwalkan meeting dengan klien existing</li>
        <li>Update progress opportunity yang sedang berjalan</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('📝 Catat Aktivitas Baru', `${data.appUrl}/crm/activities`)}
      ${buttonComponent('📊 Lihat Dashboard', `${data.appUrl}/overview-crm`, false)}
    </div>

    <p style="margin: 24px 0 0 0; color: ${TEXT_MUTED}; font-size: 14px; text-align: center;">
      Saatnya kembali beraksi dan kejar target! Let's go! 🚀
    </p>
  `

  return {
    subject: `📅 Reminder: Belum Ada Aktivitas Sales dalam ${data.daysSinceLastActivity} Hari`,
    html: emailWrapper(content),
  }
}

// =====================================================
// Template: Weekly Performance Summary
// Tone: Formal & Professional
// =====================================================
export interface SalesPerformanceData {
  salesId: string
  salesName: string
  // Activities
  totalActivities: number
  activitiesByType: { type: string; count: number }[]
  // Pipeline
  newPipelines: number
  newPipelineValue: number
  // Customers
  newCustomers: number
  // Won
  wonCount: number
  wonValue: number
  // Lost
  lostCount: number
  lostValue: number
  lostReasons: { reason: string; count: number }[]
  // Open Pipeline
  openPipelineCount: number
  openPipelineValue: number
  // Services
  serviceStats: { service: string; count: number }[]
  // RFQ
  rfqCount: number
  // Sales Cycle
  avgSalesCycleDays: number | null
}

export interface WeeklyPerformanceEmailData {
  weekStart: string
  weekEnd: string
  salesPerformance: SalesPerformanceData[]
  currency: string
  appUrl: string
}

export function weeklyPerformanceSummaryTemplate(data: WeeklyPerformanceEmailData): { subject: string; html: string } {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: data.currency }).format(value)

  // Generate sales performance rows
  const salesRows = data.salesPerformance.map((sales) => {
    const activitiesBreakdown = sales.activitiesByType
      .filter(a => a.count > 0)
      .map(a => `${a.type}: ${a.count}`)
      .join(', ') || '-'

    const topLostReasons = sales.lostReasons
      .slice(0, 3)
      .map(r => `${r.reason}: ${r.count}`)
      .join(', ') || '-'

    const topServices = sales.serviceStats
      .slice(0, 3)
      .map(s => `${s.service}: ${s.count}`)
      .join(', ') || '-'

    return `
      <tr style="background-color: #ffffff;">
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; font-weight: 600; color: ${TEXT_COLOR};">
          ${sales.salesName}
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR}; font-size: 13px;">
          <strong>${sales.totalActivities}</strong><br>
          <span style="color: ${TEXT_MUTED}; font-size: 11px;">${activitiesBreakdown}</span>
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">
          ${sales.newPipelines}<br>
          <span style="color: ${TEXT_MUTED}; font-size: 11px;">${formatCurrency(sales.newPipelineValue)}</span>
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">
          ${sales.newCustomers}
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: #10B981;">
          <strong>${sales.wonCount}</strong><br>
          <span style="font-size: 11px;">${formatCurrency(sales.wonValue)}</span>
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: #DC2626;">
          <strong>${sales.lostCount}</strong><br>
          <span style="font-size: 11px;">${formatCurrency(sales.lostValue)}</span>
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">
          ${sales.openPipelineCount}<br>
          <span style="color: ${TEXT_MUTED}; font-size: 11px;">${formatCurrency(sales.openPipelineValue)}</span>
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-size: 11px;">
          ${topServices}
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">
          ${sales.rfqCount}
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">
          ${sales.avgSalesCycleDays ? `${sales.avgSalesCycleDays} hari` : '-'}
        </td>
        <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED}; font-size: 11px;">
          ${topLostReasons}
        </td>
      </tr>
    `
  }).join('')

  // Calculate totals
  const totals = data.salesPerformance.reduce((acc, sales) => ({
    totalActivities: acc.totalActivities + sales.totalActivities,
    newPipelines: acc.newPipelines + sales.newPipelines,
    newPipelineValue: acc.newPipelineValue + sales.newPipelineValue,
    newCustomers: acc.newCustomers + sales.newCustomers,
    wonCount: acc.wonCount + sales.wonCount,
    wonValue: acc.wonValue + sales.wonValue,
    lostCount: acc.lostCount + sales.lostCount,
    lostValue: acc.lostValue + sales.lostValue,
    openPipelineCount: acc.openPipelineCount + sales.openPipelineCount,
    openPipelineValue: acc.openPipelineValue + sales.openPipelineValue,
    rfqCount: acc.rfqCount + sales.rfqCount,
  }), {
    totalActivities: 0,
    newPipelines: 0,
    newPipelineValue: 0,
    newCustomers: 0,
    wonCount: 0,
    wonValue: 0,
    lostCount: 0,
    lostValue: 0,
    openPipelineCount: 0,
    openPipelineValue: 0,
    rfqCount: 0,
  })

  const content = `
    <h2 style="margin: 0 0 8px 0; color: ${TEXT_COLOR}; font-size: 22px; font-weight: 600;">
      Laporan Kinerja Tim Sales Mingguan
    </h2>
    <p style="margin: 0 0 24px 0; color: ${TEXT_MUTED}; font-size: 14px;">
      Periode: ${data.weekStart} - ${data.weekEnd}
    </p>

    <p style="margin: 0 0 24px 0; color: ${TEXT_COLOR}; font-size: 15px; line-height: 1.6;">
      Dengan hormat,<br><br>
      Berikut kami sampaikan ringkasan kinerja tim sales untuk periode minggu yang lalu.
      Laporan ini mencakup aktivitas penjualan, pipeline, pencapaian closing, serta analisis
      performa masing-masing anggota tim sales.
    </p>

    <!-- Summary Cards -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td style="padding: 0 8px 16px 0; width: 25%;">
          <div style="background-color: #EFF6FF; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #1E40AF; font-size: 24px; font-weight: 700;">${totals.totalActivities}</p>
            <p style="margin: 0; color: #3B82F6; font-size: 12px;">Total Aktivitas</p>
          </div>
        </td>
        <td style="padding: 0 8px 16px 8px; width: 25%;">
          <div style="background-color: #F0FDF4; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #166534; font-size: 24px; font-weight: 700;">${totals.wonCount}</p>
            <p style="margin: 0; color: #22C55E; font-size: 12px;">Deal Won</p>
          </div>
        </td>
        <td style="padding: 0 8px 16px 8px; width: 25%;">
          <div style="background-color: #FEF2F2; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #991B1B; font-size: 24px; font-weight: 700;">${totals.lostCount}</p>
            <p style="margin: 0; color: #EF4444; font-size: 12px;">Deal Lost</p>
          </div>
        </td>
        <td style="padding: 0 0 16px 8px; width: 25%;">
          <div style="background-color: #FFFBEB; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #92400E; font-size: 24px; font-weight: 700;">${totals.openPipelineCount}</p>
            <p style="margin: 0; color: #F59E0B; font-size: 12px;">Pipeline Aktif</p>
          </div>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
      <tr>
        <td style="padding: 0 8px 0 0; width: 50%;">
          <div style="background-color: #F0FDF4; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #166534; font-size: 18px; font-weight: 700;">${formatCurrency(totals.wonValue)}</p>
            <p style="margin: 0; color: #22C55E; font-size: 12px;">Total Revenue Won</p>
          </div>
        </td>
        <td style="padding: 0 0 0 8px; width: 50%;">
          <div style="background-color: #FFFBEB; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 4px 0; color: #92400E; font-size: 18px; font-weight: 700;">${formatCurrency(totals.openPipelineValue)}</p>
            <p style="margin: 0; color: #F59E0B; font-size: 12px;">Total Pipeline Value</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Performance Table -->
    <h3 style="margin: 32px 0 16px 0; color: ${TEXT_COLOR}; font-size: 16px; font-weight: 600;">
      Detail Kinerja Per Sales
    </h3>

    <div style="overflow-x: auto;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; min-width: 900px;">
        <thead>
          <tr style="background-color: ${BRAND_COLOR};">
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Nama Sales</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Aktivitas</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Pipeline Baru</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">New Customer</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Won</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Lost</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Open Pipeline</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Layanan</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">RFQ</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Avg Cycle</th>
            <th style="padding: 12px; border: 1px solid ${BRAND_COLOR_DARK}; color: #ffffff; font-size: 12px; text-align: left;">Alasan Lost</th>
          </tr>
        </thead>
        <tbody>
          ${salesRows}
        </tbody>
        <tfoot>
          <tr style="background-color: ${BG_LIGHT}; font-weight: 600;">
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">TOTAL</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">${totals.totalActivities}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">${totals.newPipelines}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">${totals.newCustomers}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: #10B981;">${totals.wonCount}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: #DC2626;">${totals.lostCount}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">${totals.openPipelineCount}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED};">-</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_COLOR};">${totals.rfqCount}</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED};">-</td>
            <td style="padding: 12px; border: 1px solid ${BORDER_COLOR}; color: ${TEXT_MUTED};">-</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${buttonComponent('Lihat Dashboard Lengkap', `${data.appUrl}/overview-crm`)}
    </div>

    <p style="margin: 24px 0; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.6;">
      Demikian laporan kinerja tim sales untuk periode ini. Kami mengapresiasi kerja keras
      seluruh anggota tim dan mendorong untuk terus meningkatkan performa di minggu-minggu mendatang.
    </p>

    <p style="margin: 0; color: ${TEXT_COLOR}; font-size: 14px;">
      Hormat kami,<br>
      <strong>Tim CRM UGC Logistics</strong>
    </p>
  `

  return {
    subject: `📊 Laporan Kinerja Tim Sales Mingguan (${data.weekStart} - ${data.weekEnd})`,
    html: emailWrapper(content, true),
  }
}
