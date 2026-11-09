import { lazy, Suspense, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The console's screens load on demand behind its shell.
 *
 * A charting library, a data grid and the catalogue editor are most of this bundle, and the
 * sign-in screen needs none of them.
 *
 * In its own file because `router.tsx` exports a router, and a module that exports both a
 * component and something else loses fast refresh.
 */
const Overview = lazy(async () => ({
  default: (await import('@/admin/AdminOverview')).AdminOverview,
}))

type Section = NonNullable<Parameters<typeof Overview>[0]['section']>

export function LazyAdminOverview({ section }: { readonly section: Section }): ReactNode {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <Overview section={section} />
    </Suspense>
  )
}
