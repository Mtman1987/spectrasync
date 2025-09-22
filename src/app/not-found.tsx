
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CosmicRaidLogo } from '@/components/icons'
 
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4">
      <CosmicRaidLogo className="h-16 w-16 text-primary mb-4" />
      <h1 className="text-4xl font-bold font-headline mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The page or community you’re looking for might have been moved, deleted, or never existed.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/">Return Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings">Configure Your Community</Link>
        </Button>
      </div>
    </div>
  )
}
