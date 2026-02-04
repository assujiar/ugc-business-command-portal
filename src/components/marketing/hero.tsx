'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Globe, Package, Truck } from 'lucide-react'
import Link from 'next/link'
import { HeroGlobeBg } from '@/components/hero/HeroGlobeBg'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/hooks/use-ui-store'

// =====================================================
// Animation Variants
// =====================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
}

const featureVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut' as const,
    },
  },
}

// =====================================================
// Feature Badge Component
// =====================================================

interface FeatureBadgeProps {
  icon: React.ReactNode
  label: string
}

function FeatureBadge({ icon, label }: FeatureBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand">
      {icon}
      <span>{label}</span>
    </div>
  )
}

// =====================================================
// Stats Component
// =====================================================

interface StatItemProps {
  value: string
  label: string
}

function StatItem({ value, label }: StatItemProps) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-brand md:text-3xl">{value}</div>
      <div className="text-xs text-muted-foreground md:text-sm">{label}</div>
    </div>
  )
}

// =====================================================
// Main Hero Component
// =====================================================

export interface HeroProps {
  title?: string
  subtitle?: string
  ctaPrimaryText?: string
  ctaPrimaryHref?: string
  ctaSecondaryText?: string
  ctaSecondaryHref?: string
  showStats?: boolean
}

export function Hero({
  title = 'Global Logistics, Local Excellence',
  subtitle = 'UGC Logistics delivers seamless freight forwarding, customs brokerage, and supply chain solutions connecting Indonesia to the world.',
  ctaPrimaryText = 'Get a Quote',
  ctaPrimaryHref = '/quote',
  ctaSecondaryText = 'Learn More',
  ctaSecondaryHref = '/about',
  showStats = true,
}: HeroProps) {
  const { prefersReducedMotion } = useUIStore()

  // Use static rendering if reduced motion preferred
  const MotionWrapper = prefersReducedMotion ? 'div' : motion.div
  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: containerVariants,
        initial: 'hidden',
        animate: 'visible',
      }

  return (
    <section className="relative overflow-hidden hero-section">
      {/* Globe Background */}
      <HeroGlobeBg />

      {/* Content Container */}
      <div className="container relative z-10 mx-auto px-4 py-20 md:py-32">
        <MotionWrapper
          {...motionProps}
          className="mx-auto max-w-4xl text-center"
        >
          {/* Feature Badges */}
          <motion.div
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="mb-6 flex flex-wrap items-center justify-center gap-3"
          >
            <FeatureBadge icon={<Globe className="h-4 w-4" />} label="Global Reach" />
            <FeatureBadge icon={<Package className="h-4 w-4" />} label="End-to-End" />
            <FeatureBadge icon={<Truck className="h-4 w-4" />} label="Fast Delivery" />
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl"
          >
            <span className="bg-gradient-to-r from-foreground via-foreground to-brand bg-clip-text text-transparent">
              {title}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl"
          >
            {subtitle}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={prefersReducedMotion ? undefined : itemVariants}
            className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button asChild size="lg" className="min-w-[160px]">
              <Link href={ctaPrimaryHref}>
                {ctaPrimaryText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-[160px]">
              <Link href={ctaSecondaryHref}>{ctaSecondaryText}</Link>
            </Button>
          </motion.div>

          {/* Stats */}
          {showStats && (
            <motion.div
              variants={prefersReducedMotion ? undefined : featureVariants}
              className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm"
            >
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <StatItem value="50+" label="Countries Served" />
                <StatItem value="10K+" label="Shipments/Year" />
                <StatItem value="24/7" label="Support" />
                <StatItem value="99%" label="On-Time Delivery" />
              </div>
            </motion.div>
          )}
        </MotionWrapper>
      </div>

      {/* Decorative blob backdrop (fallback/additional effect) */}
      <div className="blob-backdrop" />
    </section>
  )
}

export default Hero
