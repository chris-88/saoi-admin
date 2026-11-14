import { createHashRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AdminConsole } from '@/admin/AdminConsole'
import { LazyAdminOverview } from '@/app/lazyAdmin'
import { NotFound } from '@/components/NotFound'
import { RouteError } from '@/app/RouteError'
import { DropAdminPrefix } from '@/app/DropAdminPrefix'

const routeObjects: RouteObject[] = [
  {
    path: '/',
    element: <AdminConsole />,
    children: [
      { index: true, element: <LazyAdminOverview section="cases" /> },
      { path: 'case/:caseId', element: <LazyAdminOverview section="case" /> },
      { path: 'guardrails', element: <LazyAdminOverview section="guardrails" /> },
      { path: 'persona', element: <LazyAdminOverview section="persona" /> },
      { path: 'engine', element: <LazyAdminOverview section="engine" /> },
      { path: 'catalogue', element: <LazyAdminOverview section="catalogue" /> },
      { path: 'analytics', element: <LazyAdminOverview section="analytics" /> },
      { path: 'ai-usage', element: <LazyAdminOverview section="ai-usage" /> },
      { path: 'forms', element: <LazyAdminOverview section="forms" /> },
      { path: 'forms/:formApplicationId', element: <LazyAdminOverview section="forms" /> },
      { path: 'feedback', element: <LazyAdminOverview section="feedback" /> },
      { path: 'collaborators', element: <LazyAdminOverview section="collaborators" /> },
      { path: 'market', element: <LazyAdminOverview section="market" /> },
      { path: 'profile', element: <LazyAdminOverview section="profile" /> },
    ],
  },
  { path: '/admin/*', element: <DropAdminPrefix /> },
  { path: '/index.html', element: <Navigate to="/" replace /> },
  { path: '*', element: <NotFound /> },
]

export const router = createHashRouter(
  routeObjects.map((route) => ({ ...route, errorElement: <RouteError /> })),
)
