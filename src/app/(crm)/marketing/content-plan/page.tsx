import { Card, CardContent } from '@/components/ui/card'
import { FileEdit, Construction } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ContentPlanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <FileEdit className="h-6 w-6" />
          Content Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Perencanaan dan tracking konten marketing di seluruh channel
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Halaman ini sedang dalam pengembangan. Fitur Content Plan akan mencakup
            content calendar, editorial workflow, multi-channel publishing schedule, dan performance tracking per konten.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
