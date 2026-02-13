// =====================================================
// API Route: /api/crm/accounts/[id]/contacts
// CRUD operations for contacts linked to an account
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

// Roles that can manage contacts
const MANAGE_CONTACTS_ROLES: UserRole[] = [
  'salesperson', 'sales support', 'sales manager',
  'super admin', 'MACX', 'Marketing Manager', 'Director',
]

// Roles with full access (can edit contacts on any account)
const FULL_ACCESS_ROLES: UserRole[] = [
  'sales support', 'sales manager',
  'super admin', 'MACX', 'Marketing Manager', 'Director',
]

// Helper: check authorization (role + ownership for salesperson)
async function checkContactPermission(
  supabase: any,
  adminClient: any,
  userId: string,
  accountId: string
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .single() as { data: { role: UserRole } | null }

  if (!profile || !MANAGE_CONTACTS_ROLES.includes(profile.role)) {
    return { allowed: false, error: 'You do not have permission to manage contacts', status: 403 }
  }

  // Verify account exists and check ownership for salesperson
  const { data: account, error: accountError } = await (adminClient as any)
    .from('accounts')
    .select('account_id, owner_user_id')
    .eq('account_id', accountId)
    .single()

  if (accountError || !account) {
    return { allowed: false, error: 'Account not found', status: 404 }
  }

  // Salesperson can only manage contacts on their own accounts
  if (profile.role === 'salesperson' && account.owner_user_id !== userId) {
    return { allowed: false, error: 'You can only manage contacts on your own accounts', status: 403 }
  }

  return { allowed: true }
}

// POST /api/crm/accounts/[id]/contacts - Create a new contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permission = await checkContactPermission(supabase, adminClient, user.id, accountId)
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: permission.status })
    }

    const body = await request.json()
    const { first_name, last_name, email, phone, mobile, job_title, department, is_primary, notes } = body

    if (!first_name || first_name.trim() === '') {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    }

    // If setting as primary, unset existing primary first
    if (is_primary) {
      await (adminClient as any)
        .from('contacts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('is_primary', true)
    }

    const contactData = {
      account_id: accountId,
      first_name: first_name.trim(),
      last_name: last_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      mobile: mobile?.trim() || null,
      job_title: job_title?.trim() || null,
      department: department?.trim() || null,
      is_primary: is_primary || false,
      notes: notes?.trim() || null,
      created_by: user.id,
    }

    const { data: newContact, error: insertError } = await (adminClient as any)
      .from('contacts')
      .insert(contactData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating contact:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Also sync to account PIC if this is primary contact
    if (is_primary) {
      const picName = [first_name.trim(), last_name?.trim()].filter(Boolean).join(' ')
      await (adminClient as any)
        .from('accounts')
        .update({
          pic_name: picName,
          pic_email: email?.trim() || null,
          pic_phone: phone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
    }

    return NextResponse.json({ data: newContact }, { status: 201 })
  } catch (error) {
    console.error('Error creating contact:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/crm/accounts/[id]/contacts - Update an existing contact
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permission = await checkContactPermission(supabase, adminClient, user.id, accountId)
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: permission.status })
    }

    const body = await request.json()
    const { contact_id, first_name, last_name, email, phone, mobile, job_title, department, is_primary, notes } = body

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 })
    }

    if (!first_name || first_name.trim() === '') {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    }

    // Verify contact belongs to this account
    const { data: existingContact, error: fetchError } = await (adminClient as any)
      .from('contacts')
      .select('contact_id, is_primary')
      .eq('contact_id', contact_id)
      .eq('account_id', accountId)
      .single()

    if (fetchError || !existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // If setting as primary, unset existing primary first (unless already primary)
    if (is_primary && !existingContact.is_primary) {
      await (adminClient as any)
        .from('contacts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('is_primary', true)
    }

    const updateData: Record<string, unknown> = {
      first_name: first_name.trim(),
      last_name: last_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      mobile: mobile?.trim() || null,
      job_title: job_title?.trim() || null,
      department: department?.trim() || null,
      is_primary: is_primary || false,
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data: updatedContact, error: updateError } = await (adminClient as any)
      .from('contacts')
      .update(updateData)
      .eq('contact_id', contact_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating contact:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Sync to account PIC if this is primary contact
    if (is_primary) {
      const picName = [first_name.trim(), last_name?.trim()].filter(Boolean).join(' ')
      await (adminClient as any)
        .from('accounts')
        .update({
          pic_name: picName,
          pic_email: email?.trim() || null,
          pic_phone: phone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
    }

    return NextResponse.json({ data: updatedContact })
  } catch (error) {
    console.error('Error updating contact:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/crm/accounts/[id]/contacts - Delete a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permission = await checkContactPermission(supabase, adminClient, user.id, accountId)
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: permission.status })
    }

    const { searchParams } = new URL(request.url)
    const contactId = searchParams.get('contact_id')

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 })
    }

    // Verify contact belongs to this account
    const { data: existingContact, error: fetchError } = await (adminClient as any)
      .from('contacts')
      .select('contact_id, is_primary')
      .eq('contact_id', contactId)
      .eq('account_id', accountId)
      .single()

    if (fetchError || !existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { error: deleteError } = await (adminClient as any)
      .from('contacts')
      .delete()
      .eq('contact_id', contactId)

    if (deleteError) {
      console.error('Error deleting contact:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // If deleted contact was primary, clear account PIC data
    if (existingContact.is_primary) {
      await (adminClient as any)
        .from('accounts')
        .update({
          pic_name: null,
          pic_email: null,
          pic_phone: null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
    }

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    console.error('Error deleting contact:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
