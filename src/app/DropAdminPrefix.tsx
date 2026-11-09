import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'

/**
 * `/admin/*`: the console's old paths, from links made while it lived at `app.saoi.ie/#/admin`.
 * The same screen sits at the root here.
 */
export function DropAdminPrefix(): ReactNode {
  const { '*': rest = '' } = useParams()
  return <Navigate to={`/${rest}`} replace />
}
