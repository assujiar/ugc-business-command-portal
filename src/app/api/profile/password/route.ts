// =====================================================
// Password Change API - Update user password
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST - Change password
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword, confirmPassword } = body

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({
        error: 'All password fields are required'
      }, { status: 400 })
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({
        error: 'New password and confirmation do not match'
      }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({
        error: 'New password must be at least 6 characters'
      }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({
        error: 'New password must be different from current password'
      }, { status: 400 })
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    })

    if (signInError) {
      return NextResponse.json({
        error: 'Current password is incorrect'
      }, { status: 400 })
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return NextResponse.json({
        error: 'Failed to update password'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully'
    })
  } catch (error: any) {
    console.error('Error changing password:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
