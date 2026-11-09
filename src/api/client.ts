import createClient, { type Middleware } from 'openapi-fetch'
import { saoiApiUrl } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import type { paths } from '@/api/schema'

/**
 * The typed client for `saoi-api` (`chris-88/saoi`, `services/api`).
 *
 * `schema.d.ts` is generated from the service's own OpenAPI document by `npm run api:generate`,
 * so a path, a path parameter or a request body that no longer matches the server is a compile
 * error here. Responses are still parsed against the Zod contracts in `src/shared/contracts`
 * by the callers, because a type is not a runtime check.
 */

async function accessToken(): Promise<string> {
  const session = await supabase?.auth.getSession()
  const token = session?.data.session?.access_token
  if (!token) throw new Error('Not signed in.')
  return token
}

const bearer: Middleware = {
  async onRequest({ request }) {
    request.headers.set('Authorization', `Bearer ${await accessToken()}`)
    return request
  },
}

export const api = createClient<paths>({
  baseUrl: saoiApiUrl,
  // Looked up on each call rather than captured once, so tests can stub `fetch`.
  fetch: (request) => globalThis.fetch(request),
})
api.use(bearer)

export class SaoiApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SaoiApiError'
    this.status = status
  }
}

/** The service's error envelope, `{ ok: false, error: { code, message } }`, as an Error. */
export function apiError(status: number, body: unknown): SaoiApiError {
  const message =
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'object' &&
    body.error !== null &&
    'message' in body.error &&
    typeof body.error.message === 'string'
      ? body.error.message
      : 'Saoirse is unavailable right now.'
  return new SaoiApiError(status, message)
}
