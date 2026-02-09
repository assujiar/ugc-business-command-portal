import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LayoutDashboard, Globe, Search, Mail, FileEdit } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function MarketingOverviewPage() {
  const modules = [
    {
      title: 'Digital Performance',
      description: 'Social media analytics dari TikTok, Instagram, YouTube, Facebook, dan LinkedIn',
      href: '/marketing/digital-performance',
      icon: Globe,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'SEO-SEM Performance',
      description: 'Analitik performa search engine optimization dan search engine marketing',
      href: '/marketing/seo-sem',
      icon: Search,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Email Marketing',
      description: 'Campaign performance, open rate, click rate, dan conversion tracking',
      href: '/marketing/email-marketing',
      icon: Mail,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Content Plan',
      description: 'Perencanaan dan tracking konten marketing di seluruh channel',
      href: '/marketing/content-plan',
      icon: FileEdit,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6" />
          Marketing Panel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dashboard analitik dan tools untuk tim marketing
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link key={module.href} href={module.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${module.bgColor}`}>
                    <module.icon className={`h-5 w-5 ${module.color}`} />
                  </div>
                  {module.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
