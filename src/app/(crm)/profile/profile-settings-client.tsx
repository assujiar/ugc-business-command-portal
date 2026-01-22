'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import {
  User,
  Phone,
  Mail,
  Building2,
  Shield,
  Camera,
  Upload,
  Check,
  X,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface ProfileSettingsClientProps {
  profile: Profile
  userEmail: string
}

// Avatar templates available in public/ava
const AVATAR_TEMPLATES = [
  { src: '/ava/ava-female (1).png', label: 'Female 1' },
  { src: '/ava/ava-female (2).png', label: 'Female 2' },
  { src: '/ava/ava-female (3).png', label: 'Female 3' },
  { src: '/ava/ava-female (4).png', label: 'Female 4' },
  { src: '/ava/ava-female (5).png', label: 'Female 5' },
  { src: '/ava/ava-male (1).png', label: 'Male 1' },
  { src: '/ava/ava-male (2).png', label: 'Male 2' },
  { src: '/ava/ava-male (3).png', label: 'Male 3' },
  { src: '/ava/ava-male (4).png', label: 'Male 4' },
  { src: '/ava/ava-male (5).png', label: 'Male 5' },
]

export function ProfileSettingsClient({ profile: initialProfile, userEmail }: ProfileSettingsClientProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile state
  const [profile, setProfile] = useState(initialProfile)
  const [name, setName] = useState(initialProfile.name)
  const [phone, setPhone] = useState(initialProfile.phone || '')
  const [saving, setSaving] = useState(false)

  // Avatar state
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  // Password state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      })

      const result = await response.json()

      if (result.success) {
        setProfile(result.data)
        toast({
          title: 'Success',
          description: 'Profile updated successfully',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Handle avatar file upload
  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setProfile(result.data.profile)
        setAvatarDialogOpen(false)
        toast({
          title: 'Success',
          description: 'Avatar uploaded successfully',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload avatar',
        variant: 'destructive',
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Handle template selection
  const handleSelectTemplate = async (templateUrl: string) => {
    setSelectedTemplate(templateUrl)
    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: templateUrl }),
      })

      const result = await response.json()

      if (result.success) {
        setProfile(result.data)
        setAvatarDialogOpen(false)
        toast({
          title: 'Success',
          description: 'Avatar updated successfully',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update avatar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      setSelectedTemplate(null)
    }
  }

  // Remove avatar
  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    try {
      const response = await fetch('/api/profile/avatar', {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        setProfile(result.data)
        setAvatarDialogOpen(false)
        toast({
          title: 'Success',
          description: 'Avatar removed successfully',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove avatar',
        variant: 'destructive',
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Change password
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'All password fields are required',
        variant: 'destructive',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'New password and confirmation do not match',
        variant: 'destructive',
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    setChangingPassword(true)
    try {
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })

      const result = await response.json()

      if (result.success) {
        setPasswordDialogOpen(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        toast({
          title: 'Success',
          description: 'Password changed successfully',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to change password',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and profile information</p>
      </div>

      <div className="grid gap-6">
        {/* Avatar Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Profile Photo
            </CardTitle>
            <CardDescription>
              Choose a profile photo from templates or upload your own
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Current Avatar */}
              <div className="relative">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.name}
                    width={96}
                    height={96}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-semibold text-primary">
                    {getInitials(profile.name)}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button onClick={() => setAvatarDialogOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Change Photo
                </Button>
                {profile.avatar_url && (
                  <Button variant="outline" onClick={handleRemoveAvatar} disabled={uploadingAvatar}>
                    {uploadingAvatar ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Remove Photo
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+62..."
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Read-only fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{userEmail}</span>
                </div>
              </div>
              <div>
                <Label>Role</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{profile.role}</Badge>
                </div>
              </div>
              {profile.department && (
                <div>
                  <Label>Department</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{profile.department}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>
              Manage your password and security settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  Change your password to keep your account secure
                </p>
              </div>
              <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                <Key className="mr-2 h-4 w-4" />
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Avatar Selection Dialog */}
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change Profile Photo</DialogTitle>
            <DialogDescription>
              Choose from templates or upload your own photo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Template Selection */}
            <div>
              <Label className="text-sm font-medium">Choose from templates</Label>
              <div className="grid grid-cols-5 gap-3 mt-3">
                {AVATAR_TEMPLATES.map((template) => (
                  <button
                    key={template.src}
                    onClick={() => handleSelectTemplate(template.src)}
                    disabled={saving || uploadingAvatar}
                    className={`relative rounded-full overflow-hidden border-2 transition-all hover:border-primary aspect-square ${
                      selectedTemplate === template.src ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                    } ${profile.avatar_url === template.src ? 'ring-2 ring-green-500' : ''}`}
                    title={template.label}
                  >
                    <Image
                      src={template.src}
                      alt={template.label}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                    />
                    {profile.avatar_url === template.src && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <Check className="h-6 w-6 text-green-600" />
                      </div>
                    )}
                    {selectedTemplate === template.src && saving && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 text-white animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Upload Custom */}
            <div>
              <Label className="text-sm font-medium">Or upload your own</Label>
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAvatarUpload(file)
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar || saving}
                  className="w-full h-24 border-dashed"
                >
                  {uploadingAvatar ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Click to upload (max 5MB)
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Supported formats: JPEG, PNG, GIF, WebP
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAvatarDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and a new password
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Key className="mr-2 h-4 w-4" />
              )}
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
