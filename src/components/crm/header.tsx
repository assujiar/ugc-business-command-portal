// =====================================================
// CRM Header
// SOURCE: PDF - App Structure
// Mobile-responsive with hamburger menu trigger
// =====================================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { LogOut, User, Settings, Menu } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface HeaderProps {
  profile: Profile
  onMenuClick?: () => void
}

export function Header({ profile, onMenuClick }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0">
          <h2 className="text-base lg:text-lg font-semibold truncate">CRM Dashboard</h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.name}
                  width={32}
                  height={32}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 bg-brand/10 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-brand" />
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.name}
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-brand/10 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-brand" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{profile.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
