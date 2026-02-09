import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Construction } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function SEOSEMPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <Search className="h-6 w-6" />
          SEO-SEM Performance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analitik performa search engine optimization dan search engine marketing
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Halaman ini sedang dalam pengembangan. Fitur SEO-SEM Performance akan mencakup
            tracking keyword ranking, organic traffic, paid ads performance, dan cost per acquisition.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
