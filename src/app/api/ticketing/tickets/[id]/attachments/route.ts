import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/tickets/[id]/attachments - List attachments for a ticket
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get ticket to check access
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('created_by, assigned_to')
      .eq('id', id)
      .single() as { data: { created_by: string; assigned_to: string | null } | null }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check access
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch attachments
    const { data: attachments, error } = await (supabase as any)
      .from('ticket_attachments')
      .select(`
        *,
        uploader:profiles!ticket_attachments_uploaded_by_fkey(user_id, name, email)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching attachments:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: attachments || [],
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ticketing/tickets/[id]/attachments - Upload attachment
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get ticket to check access
    const { data: ticket } = await (supabase as any)
      .from('tickets')
      .select('created_by, assigned_to, ticket_code')
      .eq('id', id)
      .single() as { data: { created_by: string; assigned_to: string | null; ticket_code: string } | null }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Check access (creator, assignee, or can view all)
    if (!canViewAllTickets(profile.role) &&
        ticket.created_by !== user.id &&
        ticket.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    // Generate file path
    const timestamp = Date.now()
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `tickets/${ticket.ticket_code}/${timestamp}_${safeFileName}`

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ticketing-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('ticketing-attachments')
      .getPublicUrl(filePath)

    // Insert attachment record
    const { data: attachment, error: insertError } = await (supabase as any)
      .from('ticket_attachments')
      .insert({
        ticket_id: id,
        file_name: file.name,
        file_path: filePath,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting attachment record:', insertError)
      // Try to delete uploaded file
      await supabase.storage.from('ticketing-attachments').remove([filePath])
      return NextResponse.json({ error: 'Failed to save attachment record' }, { status: 500 })
    }

    // Record event
    await (supabase as any)
      .from('ticket_events')
      .insert({
        ticket_id: id,
        event_type: 'attachment_added',
        actor_user_id: user.id,
        new_value: { file_name: file.name, file_size: file.size },
      })

    return NextResponse.json({
      success: true,
      data: attachment,
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/ticketing/tickets/[id]/attachments - Delete attachment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachment_id')

    if (!attachmentId) {
      return NextResponse.json({ error: 'Missing attachment_id parameter' }, { status: 400 })
    }

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get attachment
    const { data: attachment } = await (supabase as any)
      .from('ticket_attachments')
      .select('*')
      .eq('id', attachmentId)
      .eq('ticket_id', id)
      .single()

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    // Only admin, ops, or uploader can delete
    if (!canViewAllTickets(profile.role) && attachment.uploaded_by !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete from storage
    const { error: deleteStorageError } = await supabase.storage
      .from('ticketing-attachments')
      .remove([attachment.file_path])

    if (deleteStorageError) {
      console.error('Error deleting file from storage:', deleteStorageError)
    }

    // Delete record
    const { error: deleteError } = await (supabase as any)
      .from('ticket_attachments')
      .delete()
      .eq('id', attachmentId)

    if (deleteError) {
      console.error('Error deleting attachment record:', deleteError)
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }

    // Record event (use attachment_added with notes to indicate removal)
    await (supabase as any)
      .from('ticket_events')
      .insert({
        ticket_id: id,
        event_type: 'attachment_added',
        actor_user_id: user.id,
        old_value: { file_name: attachment.file_name, action: 'removed' },
        new_value: null,
        notes: `Attachment removed: ${attachment.file_name}`,
      })

    return NextResponse.json({
      success: true,
      message: 'Attachment deleted',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
