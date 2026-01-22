import {
  getEmailHeader,
  getEmailFooter,
  formatCurrency,
  formatDate,
  formatDateShort,
  getPriorityBadge,
  getActionButton,
  getInfoBox,
  getAlertBox,
} from './crm-email'

// =====================================================
// CRM Email Templates
// Templates dibuat dengan bahasa yang asik dan tidak kaku
// kecuali untuk weekly performance summary (formal & professional)
// =====================================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.ugc.co.id'

// =====================================================
// 1. NEW LEAD ASSIGNMENT EMAIL
// Dikirim ke seluruh salesperson saat ada lead baru
// =====================================================

export interface NewLeadAssignmentData {
  lead: {
    lead_id: string
    company_name: string
    pic_name: string | null
    pic_email: string | null
    pic_phone: string | null
    industry: string | null
    source: string
    priority: number
    potential_revenue: number | null
    inquiry_text: string | null
    created_at: string
  }
  assignedBy: {
    name: string
    email: string
  }
}

export function generateNewLeadAssignmentEmail(data: NewLeadAssignmentData): string {
  const { lead, assignedBy } = data
  const claimUrl = `${APP_URL}/sales-inbox`

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 22px;">
      Halo Sales Warriors!
    </h2>

    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">
      Ada kabar gembira nih! Lead baru udah masuk dan siap buat di-claim.
      Buruan cek sebelum didahului teman-teman yang lain!
    </p>

    ${getAlertBox('warning', 'First come, first served! Yang cepat yang dapat ya!')}

    ${getInfoBox('Detail Lead', [
      { label: 'Lead ID', value: lead.lead_id },
      { label: 'Perusahaan', value: lead.company_name },
      { label: 'PIC', value: lead.pic_name || '-' },
      { label: 'Email', value: lead.pic_email || '-' },
      { label: 'Telepon', value: lead.pic_phone || '-' },
      { label: 'Industri', value: lead.industry || '-' },
      { label: 'Sumber', value: lead.source },
      { label: 'Prioritas', value: getPriorityBadge(lead.priority) },
      { label: 'Potensi Revenue', value: formatCurrency(lead.potential_revenue) },
      { label: 'Tanggal Masuk', value: formatDate(lead.created_at) },
    ])}

    ${lead.inquiry_text ? `
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <h4 style="margin: 0 0 10px 0; color: #475569; font-size: 13px; text-transform: uppercase;">Inquiry:</h4>
        <p style="margin: 0; color: #334155; font-size: 14px; font-style: italic;">"${lead.inquiry_text}"</p>
      </div>
    ` : ''}

    ${getActionButton(claimUrl, 'Claim Lead Sekarang!')}

    <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">
      Lead ini di-assign oleh: <strong>${assignedBy.name}</strong>
    </p>

    <p style="margin: 30px 0 0 0; color: #475569; font-size: 14px;">
      Semangat closing ya!<br>
      <span style="color: #94a3b8;">- Tim CRM UGC Logistics</span>
    </p>

    ${getEmailFooter()}
  `
}

// =====================================================
// 2. UNCLAIMED LEAD REMINDER EMAIL
// Dikirim jika lead belum di-claim dalam interval waktu tertentu
// =====================================================

export interface UnclaimedLeadReminderData {
  lead: {
    lead_id: string
    company_name: string
    pic_name: string | null
    pic_email: string | null
    pic_phone: string | null
    industry: string | null
    source: string
    priority: number
    potential_revenue: number | null
    inquiry_text: string | null
    handed_over_at: string
  }
  assignedBy: {
    name: string
    email: string
  }
  hoursElapsed: number
  reminderNumber: number
}

export function generateUnclaimedLeadReminderEmail(data: UnclaimedLeadReminderData): string {
  const { lead, assignedBy, hoursElapsed, reminderNumber } = data
  const claimUrl = `${APP_URL}/sales-inbox`

  const urgencyLevel = hoursElapsed >= 48 ? 'danger' : hoursElapsed >= 24 ? 'warning' : 'info'
  const urgencyMessage = hoursElapsed >= 48
    ? `Udah ${hoursElapsed} jam nih lead ini nganggur! Potensi revenue ${formatCurrency(lead.potential_revenue)} bisa melayang kalau nggak ada yang follow up!`
    : hoursElapsed >= 24
    ? `Udah lebih dari sehari lead ini belum ada yang claim. Jangan sampai opportunity ini kelewat ya!`
    : `Lead ini udah ${hoursElapsed} jam menunggu diclaim. Ayo buruan sebelum didahului yang lain!`

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 22px;">
      ${hoursElapsed >= 48 ? 'Reminder Urgent!' : hoursElapsed >= 24 ? 'Reminder Penting!' : 'Friendly Reminder'}
    </h2>

    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">
      Hey Sales Team! Ini pengingat ke-${reminderNumber} untuk lead yang masih belum di-claim.
    </p>

    ${getAlertBox(urgencyLevel, urgencyMessage)}

    ${getInfoBox('Detail Lead', [
      { label: 'Lead ID', value: lead.lead_id },
      { label: 'Perusahaan', value: lead.company_name },
      { label: 'PIC', value: lead.pic_name || '-' },
      { label: 'Email', value: lead.pic_email || '-' },
      { label: 'Telepon', value: lead.pic_phone || '-' },
      { label: 'Industri', value: lead.industry || '-' },
      { label: 'Sumber', value: lead.source },
      { label: 'Prioritas', value: getPriorityBadge(lead.priority) },
      { label: 'Potensi Revenue', value: formatCurrency(lead.potential_revenue) },
      { label: 'Menunggu Sejak', value: formatDate(lead.handed_over_at) },
      { label: 'Durasi Menunggu', value: `${hoursElapsed} jam` },
    ])}

    <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 500;">
        Setiap jam yang berlalu = kesempatan yang bisa hilang
      </p>
    </div>

    ${getActionButton(claimUrl, 'Claim & Follow Up Sekarang!')}

    <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">
      Lead ini di-assign oleh: <strong>${assignedBy.name}</strong>
    </p>

    <p style="margin: 30px 0 0 0; color: #475569; font-size: 14px;">
      Yuk, jangan sampai kehilangan potensi revenue!<br>
      <span style="color: #94a3b8;">- Tim CRM UGC Logistics</span>
    </p>

    ${getEmailFooter()}
  `
}

// =====================================================
// 3. PIPELINE DUE DATE REMINDER EMAIL
// Dikirim 24 jam, 12 jam, dan 4 jam sebelum due date
// =====================================================

export interface PipelineDueDateReminderData {
  opportunity: {
    opportunity_id: string
    name: string
    stage: string
    estimated_value: number | null
    next_step: string | null
    next_step_due_date: string
  }
  account: {
    company_name: string
    pic_name: string | null
  }
  sales: {
    name: string
    email: string
  }
  hoursUntilDue: number
}

export function generatePipelineDueDateReminderEmail(data: PipelineDueDateReminderData): string {
  const { opportunity, account, sales, hoursUntilDue } = data
  const pipelineUrl = `${APP_URL}/pipeline/${opportunity.opportunity_id}`

  const urgencyMessage = hoursUntilDue <= 4
    ? 'Tinggal beberapa jam lagi! Pastikan step ini selesai tepat waktu ya.'
    : hoursUntilDue <= 12
    ? 'Kurang dari setengah hari lagi! Semangat menyelesaikan tahap ini.'
    : 'Masih ada waktu sehari, tapi jangan ditunda-tunda ya!'

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 22px;">
      Hey ${sales.name.split(' ')[0]}! Ada Pipeline yang Butuh Perhatian
    </h2>

    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">
      Reminder nih buat pipeline kamu yang due date-nya udah dekat.
    </p>

    ${getAlertBox(hoursUntilDue <= 4 ? 'danger' : hoursUntilDue <= 12 ? 'warning' : 'info', urgencyMessage)}

    ${getInfoBox('Detail Pipeline', [
      { label: 'Opportunity', value: opportunity.name },
      { label: 'Customer', value: account.company_name },
      { label: 'PIC', value: account.pic_name || '-' },
      { label: 'Stage', value: `<span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">${opportunity.stage}</span>` },
      { label: 'Nilai Estimasi', value: formatCurrency(opportunity.estimated_value) },
      { label: 'Next Step', value: opportunity.next_step || '-' },
      { label: 'Due Date', value: formatDate(opportunity.next_step_due_date) },
      { label: 'Waktu Tersisa', value: `<strong style="color: ${hoursUntilDue <= 4 ? '#dc2626' : hoursUntilDue <= 12 ? '#ea580c' : '#2563eb'};">${hoursUntilDue} jam</strong>` },
    ])}

    <div style="background-color: #f0fdf4; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="margin: 0 0 10px 0; color: #166534; font-size: 14px;">Tips:</h4>
      <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 13px;">
        <li>Update progress di pipeline setelah selesai follow up</li>
        <li>Catat evidence/dokumentasi kalau ada</li>
        <li>Jangan lupa set next step yang jelas</li>
      </ul>
    </div>

    ${getActionButton(pipelineUrl, 'Buka Pipeline')}

    <p style="margin: 30px 0 0 0; color: #475569; font-size: 14px;">
      Keep pushing! Closing sudah di depan mata!<br>
      <span style="color: #94a3b8;">- Tim CRM UGC Logistics</span>
    </p>

    ${getEmailFooter()}
  `
}

// =====================================================
// 4. OVERDUE PIPELINE REMINDER EMAIL
// Dikirim 1 jam, 6 jam, 12 jam, 24 jam setelah due date
// =====================================================

export interface OverduePipelineReminderData {
  opportunity: {
    opportunity_id: string
    name: string
    stage: string
    estimated_value: number | null
    next_step: string | null
    next_step_due_date: string
  }
  account: {
    company_name: string
    pic_name: string | null
  }
  sales: {
    name: string
    email: string
  }
  hoursOverdue: number
  includeManagement: boolean
}

export function generateOverduePipelineReminderEmail(data: OverduePipelineReminderData): string {
  const { opportunity, account, sales, hoursOverdue, includeManagement } = data
  const pipelineUrl = `${APP_URL}/pipeline/${opportunity.opportunity_id}`

  const urgencyMessage = hoursOverdue >= 24
    ? 'Pipeline ini sudah melewati due date lebih dari 24 jam. Ini perlu segera ditangani untuk menghindari kerugian potensi revenue.'
    : hoursOverdue >= 12
    ? 'Udah lebih dari setengah hari nih pipeline ini melewati due date. Butuh update segera!'
    : `Pipeline ini sudah ${hoursOverdue} jam melewati due date. Segera update ya!`

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 20px 0; color: #dc2626; font-size: 22px;">
      ${hoursOverdue >= 24 ? 'Action Required: Pipeline Overdue!' : 'Reminder: Pipeline Lewat Due Date'}
    </h2>

    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">
      ${includeManagement
        ? `Pipeline milik ${sales.name} sudah melewati due date dan belum ada update.`
        : `Hey ${sales.name.split(' ')[0]}! Ada pipeline yang butuh perhatian urgent nih.`
      }
    </p>

    ${getAlertBox('danger', urgencyMessage)}

    ${getInfoBox('Detail Pipeline', [
      { label: 'Opportunity', value: opportunity.name },
      { label: 'Customer', value: account.company_name },
      { label: 'PIC', value: account.pic_name || '-' },
      { label: 'Stage', value: `<span style="background-color: #fee2e2; color: #dc2626; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">${opportunity.stage}</span>` },
      { label: 'Nilai Estimasi', value: formatCurrency(opportunity.estimated_value) },
      { label: 'Next Step', value: opportunity.next_step || '-' },
      { label: 'Due Date', value: formatDate(opportunity.next_step_due_date) },
      { label: 'Overdue', value: `<strong style="color: #dc2626;">${hoursOverdue} jam</strong>` },
      { label: 'Sales', value: sales.name },
    ])}

    ${includeManagement ? `
      <div style="background-color: #fef2f2; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b; font-size: 13px;">
          <strong>Catatan untuk Management:</strong><br>
          Email ini juga dikirim sebagai eskalasi karena pipeline sudah melewati 24 jam dari due date tanpa ada update.
        </p>
      </div>
    ` : ''}

    ${getActionButton(pipelineUrl, 'Update Pipeline Sekarang')}

    <p style="margin: 30px 0 0 0; color: #475569; font-size: 14px;">
      ${includeManagement
        ? 'Mohon segera ditindaklanjuti untuk menjaga performa tim.'
        : 'Yuk segera update, jangan sampai opportunity ini hilang!'
      }<br>
      <span style="color: #94a3b8;">- Tim CRM UGC Logistics</span>
    </p>

    ${getEmailFooter()}
  `
}

// =====================================================
// 5. SALES INACTIVITY REMINDER EMAIL
// Dikirim jika tidak ada aktivitas dalam 2 hari
// =====================================================

export interface SalesInactivityReminderData {
  sales: {
    user_id: string
    name: string
    email: string
  }
  lastActivity: {
    activity_type: string
    subject: string
    completed_at: string
  } | null
  daysSinceLastActivity: number
  activeOpportunitiesCount: number
  totalPipelineValue: number
}

export function generateSalesInactivityReminderEmail(data: SalesInactivityReminderData): string {
  const { sales, lastActivity, daysSinceLastActivity, activeOpportunitiesCount, totalPipelineValue } = data
  const activitiesUrl = `${APP_URL}/activities`
  const pipelineUrl = `${APP_URL}/pipeline`

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 22px;">
      Hey ${sales.name.split(' ')[0]}! Apa Kabar?
    </h2>

    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">
      Kita notice nih udah ${daysSinceLastActivity} hari belum ada aktivitas sales yang tercatat di sistem.
      Semoga sehat selalu dan tetap semangat ya!
    </p>

    ${getAlertBox('info', `Pipeline kamu masih punya ${activeOpportunitiesCount} opportunity aktif dengan total nilai ${formatCurrency(totalPipelineValue)}. Sayang banget kalau nggak di-follow up!`)}

    ${lastActivity ? getInfoBox('Aktivitas Terakhir', [
      { label: 'Tipe', value: lastActivity.activity_type },
      { label: 'Subject', value: lastActivity.subject },
      { label: 'Tanggal', value: formatDate(lastActivity.completed_at) },
    ]) : `
      <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          Belum ada aktivitas tercatat di sistem. Yuk mulai catat aktivitas pertamamu!
        </p>
      </div>
    `}

    <div style="background-color: #f0fdf4; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="margin: 0 0 10px 0; color: #166534; font-size: 14px;">Ide Aktivitas:</h4>
      <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 13px;">
        <li>Follow up customer via telepon atau WhatsApp</li>
        <li>Schedule meeting dengan prospect baru</li>
        <li>Visit customer untuk maintain relationship</li>
        <li>Review dan update pipeline yang ada</li>
      </ul>
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="padding-right: 10px;">
          ${getActionButton(activitiesUrl, 'Catat Aktivitas')}
        </td>
        <td style="padding-left: 10px;">
          ${getActionButton(pipelineUrl, 'Lihat Pipeline', false)}
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; color: #475569; font-size: 14px;">
      Keep moving forward! Setiap aktivitas kecil bisa jadi closing besar!<br>
      <span style="color: #94a3b8;">- Tim CRM UGC Logistics</span>
    </p>

    ${getEmailFooter()}
  `
}

// =====================================================
// 6. WEEKLY PERFORMANCE SUMMARY EMAIL
// Dikirim setiap Senin jam 08.00 WIB
// Format: FORMAL & PROFESSIONAL
// =====================================================

export interface SalesPerformanceData {
  user_id: string
  name: string
  email: string
  activities: {
    total: number
    by_type: { type: string; count: number }[]
  }
  pipeline: {
    total_count: number
    total_value: number
  }
  new_customers: number
  won: {
    count: number
    value: number
  }
  lost: {
    count: number
    value: number
    reasons: { reason: string; count: number }[]
  }
  open_pipeline: {
    count: number
    value: number
  }
  services_statistics: {
    leads: { service: string; count: number }[]
    pipeline: { service: string; count: number }[]
    tickets: { service: string; count: number }[]
    quotations: { service: string; count: number }[]
  }
  rfq_submitted: number
  avg_sales_cycle_days: number | null
}

export interface WeeklyPerformanceSummaryData {
  period: {
    start: string
    end: string
  }
  salesPerformances: SalesPerformanceData[]
  teamTotals: {
    activities: number
    pipeline_count: number
    pipeline_value: number
    new_customers: number
    won_count: number
    won_value: number
    lost_count: number
    lost_value: number
  }
}

export function generateWeeklyPerformanceSummaryEmail(data: WeeklyPerformanceSummaryData): string {
  const { period, salesPerformances, teamTotals } = data
  const dashboardUrl = `${APP_URL}/dashboard`

  return `
    ${getEmailHeader()}

    <h2 style="margin: 0 0 10px 0; color: #1e293b; font-size: 22px; font-weight: 700;">
      Laporan Performa Sales Mingguan
    </h2>
    <p style="margin: 0 0 25px 0; color: #64748b; font-size: 14px;">
      Periode: ${formatDateShort(period.start)} - ${formatDateShort(period.end)}
    </p>

    <!-- Team Summary -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 12px; margin-bottom: 25px;">
      <tr>
        <td style="padding: 25px;">
          <h3 style="margin: 0 0 20px 0; color: #ffffff; font-size: 16px; font-weight: 600;">
            Ringkasan Performa Tim
          </h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="25%" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">Total Aktivitas</div>
                <div style="color: #ffffff; font-size: 24px; font-weight: 700;">${teamTotals.activities}</div>
              </td>
              <td width="25%" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">Pipeline Aktif</div>
                <div style="color: #ffffff; font-size: 24px; font-weight: 700;">${teamTotals.pipeline_count}</div>
              </td>
              <td width="25%" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">Won Deals</div>
                <div style="color: #ffffff; font-size: 24px; font-weight: 700;">${teamTotals.won_count}</div>
              </td>
              <td width="25%" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">New Customers</div>
                <div style="color: #ffffff; font-size: 24px; font-weight: 700;">${teamTotals.new_customers}</div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">Total Pipeline Value</div>
                <div style="color: #ffffff; font-size: 20px; font-weight: 700;">${formatCurrency(teamTotals.pipeline_value)}</div>
              </td>
              <td colspan="2" style="text-align: center; padding: 10px;">
                <div style="color: #93c5fd; font-size: 12px; margin-bottom: 5px;">Total Won Value</div>
                <div style="color: #ffffff; font-size: 20px; font-weight: 700;">${formatCurrency(teamTotals.won_value)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Individual Performance -->
    <h3 style="margin: 25px 0 15px 0; color: #1e293b; font-size: 16px; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
      Performa Per Sales
    </h3>

    ${salesPerformances.map((sales, index) => `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 20px;">
            <h4 style="margin: 0 0 15px 0; color: #1e293b; font-size: 15px; font-weight: 600;">
              ${index + 1}. ${sales.name}
            </h4>

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td width="50%" style="vertical-align: top; padding-right: 10px;">
                  <!-- Activities -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Aktivitas (${sales.activities.total})</div>
                    <div style="color: #334155; font-size: 12px;">
                      ${sales.activities.by_type.map(a => `${a.type}: ${a.count}`).join(', ') || '-'}
                    </div>
                  </div>

                  <!-- Pipeline -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Pipeline</div>
                    <div style="color: #334155; font-size: 12px;">
                      ${sales.pipeline.total_count} opportunities (${formatCurrency(sales.pipeline.total_value)})
                    </div>
                  </div>

                  <!-- Won/Lost -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Won / Lost</div>
                    <div style="color: #334155; font-size: 12px;">
                      <span style="color: #16a34a;">Won: ${sales.won.count} (${formatCurrency(sales.won.value)})</span> |
                      <span style="color: #dc2626;">Lost: ${sales.lost.count} (${formatCurrency(sales.lost.value)})</span>
                    </div>
                  </div>
                </td>

                <td width="50%" style="vertical-align: top; padding-left: 10px;">
                  <!-- Open Pipeline -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Open Pipeline</div>
                    <div style="color: #334155; font-size: 12px;">
                      ${sales.open_pipeline.count} (${formatCurrency(sales.open_pipeline.value)})
                    </div>
                  </div>

                  <!-- New Customers -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">New Customers</div>
                    <div style="color: #334155; font-size: 12px;">${sales.new_customers}</div>
                  </div>

                  <!-- RFQ & Cycle -->
                  <div style="margin-bottom: 15px;">
                    <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">RFQ Submitted / Avg. Sales Cycle</div>
                    <div style="color: #334155; font-size: 12px;">
                      ${sales.rfq_submitted} / ${sales.avg_sales_cycle_days ? `${sales.avg_sales_cycle_days.toFixed(1)} hari` : '-'}
                    </div>
                  </div>
                </td>
              </tr>
            </table>

            ${sales.lost.reasons.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0;">
                <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Alasan Lost</div>
                <div style="color: #334155; font-size: 12px;">
                  ${sales.lost.reasons.map(r => `${r.reason}: ${r.count}`).join(', ')}
                </div>
              </div>
            ` : ''}

            ${sales.services_statistics.leads.length > 0 || sales.services_statistics.pipeline.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0;">
                <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 5px;">Statistik Layanan</div>
                <div style="color: #334155; font-size: 11px;">
                  ${sales.services_statistics.leads.length > 0 ? `<strong>Leads:</strong> ${sales.services_statistics.leads.map(s => `${s.service}(${s.count})`).join(', ')}` : ''}
                  ${sales.services_statistics.pipeline.length > 0 ? `<br><strong>Pipeline:</strong> ${sales.services_statistics.pipeline.map(s => `${s.service}(${s.count})`).join(', ')}` : ''}
                </div>
              </div>
            ` : ''}
          </td>
        </tr>
      </table>
    `).join('')}

    ${getActionButton(dashboardUrl, 'Lihat Dashboard Lengkap')}

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Laporan ini dibuat secara otomatis oleh sistem CRM UGC Logistics.
        Data yang ditampilkan merupakan rekap aktivitas periode ${formatDateShort(period.start)} - ${formatDateShort(period.end)}.
      </p>
    </div>

    <p style="margin: 20px 0 0 0; color: #475569; font-size: 14px;">
      Hormat kami,<br>
      <strong>Tim CRM UGC Logistics</strong>
    </p>

    ${getEmailFooter()}
  `
}
