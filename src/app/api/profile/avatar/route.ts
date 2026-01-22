// =====================================================
// Avatar Upload API - Upload profile picture
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// POST - Upload avatar
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP'
      }, { status: 400 })
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${user.id}/${Date.now()}.${fileExt}`

    // Delete old avatar if exists
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .single() as { data: { avatar_url: string | null } | null }

    if (currentProfile?.avatar_url && currentProfile.avatar_url.includes('avatars/')) {
      // Extract the path from the URL
      const urlParts = currentProfile.avatar_url.split('avatars/')
      if (urlParts.length > 1) {
        const oldPath = urlParts[1].split('?')[0] // Remove query params
        await adminClient.storage.from('avatars').remove([oldPath])
      }
    }

    // Upload new avatar
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(fileName)

    // Update profile with new avatar URL
    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        avatar_url: publicUrl,
        profile
      },
      message: 'Avatar uploaded successfully'
    })
  } catch (error: any) {
    console.error('Error uploading avatar:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remove avatar
export async function DELETE() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current avatar
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .single() as { data: { avatar_url: string | null } | null }

    // Delete from storage if exists
    if (currentProfile?.avatar_url && currentProfile.avatar_url.includes('avatars/')) {
      const urlParts = currentProfile.avatar_url.split('avatars/')
      if (urlParts.length > 1) {
        const oldPath = urlParts[1].split('?')[0]
        await adminClient.storage.from('avatars').remove([oldPath])
      }
    }

    // Update profile to remove avatar URL
    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: profile,
      message: 'Avatar removed successfully'
    })
  } catch (error: any) {
    console.error('Error removing avatar:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
