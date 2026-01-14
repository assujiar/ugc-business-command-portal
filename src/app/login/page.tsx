// =====================================================
// Login Page - Split Screen Design
// SOURCE: PDF - Authentication
// =====================================================

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  Shield,
  BarChart3,
  Users,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Database
} from 'lucide-react'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
      } else {
        // Use full page navigation to ensure middleware runs and cookies sync
        window.location.href = '/dashboard'
      }
    } catch (err) {
      setError('An error occurred during login')
    } finally {
      setIsLoading(false)
    }
  }

  const features = [
    {
      icon: Shield,
      title: 'Role-based Access Control',
      description: '15 distinct roles with granular permissions'
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Live KPI monitoring and insights'
    },
    {
      icon: Users,
      title: 'CRM Integration',
      description: 'Complete lead-to-customer pipeline'
    }
  ]

  const stats = [
    { value: '15', label: 'User Roles' },
    { value: '5', label: 'Core Modules' },
    { value: '100%', label: 'RLS Secured' }
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Marketing Content */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]" />

        {/* Orange Gradient Overlay at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-brand/30 via-brand/10 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-8 lg:p-12 xl:p-16 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand/20 border border-brand/30 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-brand" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">UGC Logistics</h2>
              <p className="text-slate-400 text-sm">Integrated Dashboard</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center py-12">
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
              Your Complete<br />
              <span className="text-white">Business Command Center</span>
            </h1>
            <p className="text-slate-400 text-lg mb-10 max-w-lg">
              Monitor KPIs, manage leads, track tickets, and control receivables—all in one powerful dashboard.
            </p>

            {/* Feature Cards */}
            <div className="space-y-3">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm">{feature.title}</h3>
                    <p className="text-slate-400 text-sm">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-12">
            {stats.map((stat, index) => (
              <div key={index}>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-slate-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex flex-col bg-background">
        {/* Theme Toggle */}
        <div className="flex justify-end p-4 lg:p-6">
          <ThemeToggle />
        </div>

        {/* Login Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 lg:px-12 xl:px-20 pb-12">
          <div className="w-full max-w-md">
            {/* Mobile Logo - Only visible on small screens */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold">UGC Logistics</h2>
                <p className="text-muted-foreground text-xs">Business Command Portal</p>
              </div>
            </div>

            {/* Form Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
              <p className="text-muted-foreground">Sign in to access your dashboard</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-muted/50"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 bg-muted/50"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  'Signing in...'
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            {/* Security Badges */}
            <div className="flex items-center justify-center gap-6 mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Database className="w-4 h-4" />
                <span>RLS Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-muted-foreground text-sm border-t border-border">
          &copy; 2026 UGC Logistics. All rights reserved.
        </div>
      </div>
    </div>
  )
}
