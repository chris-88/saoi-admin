import { api, apiError, SaoiApiError } from '@/api/client'
import type { AdminRequest } from '@contracts/admin.ts'

export { SaoiApiError }

/**
 * The console's calls to `saoi-api`, through the typed client in `@/api/client`.
 *
 * Each admin action goes to its own resource route under `/api/admin`. The client checks paths
 * and request bodies against the service's OpenAPI document at compile time; the payload comes
 * back as `unknown` and `adminClient` parses it against its Zod contract. Destructive actions
 * send `confirm: true`, which the service requires; `reset_case` needs its case id.
 */

type ApiResult = { readonly data?: unknown; readonly error?: unknown; readonly response: Response }

async function payload(call: Promise<ApiResult>): Promise<unknown> {
  const { data, error, response } = await call
  if (!response.ok) throw apiError(response.status, error)
  return data
}

/**
 * A request body as it goes over the wire: keys whose value is `undefined` dropped, at any depth.
 *
 * Zod infers an optional field as `?: T | undefined`; the generated types say `?: T`, and
 * with `exactOptionalPropertyTypes` those differ. In JSON they are the same thing, so the body
 * is put through JSON, which is what `fetch` would have done to it anyway.
 */
type Compact<T> = T extends readonly (infer U)[]
  ? Compact<U>[]
  : T extends object
    ? { [K in keyof T]: Compact<Exclude<T[K], undefined>> }
    : T
function compact<T>(value: T): Compact<T> {
  return JSON.parse(JSON.stringify(value)) as Compact<T>
}

export function callAdminApi(request: AdminRequest): Promise<unknown> {
  switch (request.action) {
    case 'overview':
      return payload(
        api.GET('/api/admin/overview', {
          params: {
            query: compact({ period: request.period, caseId: request.caseId }),
          },
        }),
      )
    case 'analytics':
      return payload(
        api.GET('/api/admin/analytics', { params: { query: { period: request.period } } }),
      )
    case 'list_feedback':
      return payload(
        api.GET('/api/admin/feedback', { params: { query: { period: request.period } } }),
      )
    case 'list_collaborators':
      return payload(api.GET('/api/admin/collaborators'))
    case 'inspect_case':
      return payload(
        api.GET('/api/admin/cases/{caseId}', { params: { path: { caseId: request.caseId } } }),
      )
    case 'reset_case':
      if (request.caseId === undefined) {
        return Promise.reject(new Error('Choose a case to rebuild.'))
      }
      return payload(
        api.POST('/api/admin/cases/reset', { body: { caseId: request.caseId, confirm: true } }),
      )
    case 'delete_case':
      return payload(
        api.DELETE('/api/admin/cases/{caseId}', {
          params: { path: { caseId: request.caseId } },
          body: { confirm: true },
        }),
      )
    case 'purge_cases':
      return payload(api.POST('/api/admin/cases/purge', { body: { confirm: true } }))
    case 'tag_test_case':
      return payload(
        api.POST('/api/admin/cases/{caseId}/tag-test', {
          params: { path: { caseId: request.caseId } },
        }),
      )
    case 'simulate_event': {
      const { action: _action, applicationId, ...body } = request
      return payload(
        api.POST('/api/admin/applications/{applicationId}/events', {
          params: { path: { applicationId } },
          body: compact(body),
        }),
      )
    }
    case 'reach_savings_target':
      return payload(
        api.POST('/api/admin/cases/{caseId}/savings-target/reach', {
          params: { path: { caseId: request.caseId } },
        }),
      )
    case 'set_savings_balance':
      return payload(
        api.PUT('/api/admin/cases/{caseId}/savings-balance', {
          params: { path: { caseId: request.caseId } },
          body: { amount: request.amount },
        }),
      )
    case 'plan_move':
      return payload(
        api.POST('/api/admin/cases/{caseId}/plans/{planId}/moves', {
          params: { path: { caseId: request.caseId, planId: request.planId } },
          body: { move: request.move },
        }),
      )
    case 'verify_documents':
      return payload(
        api.POST('/api/admin/cases/{caseId}/documents/verify', {
          params: { path: { caseId: request.caseId } },
        }),
      )
    case 'demo_action':
      return payload(
        api.POST('/api/admin/cases/{caseId}/demo-actions', {
          params: { path: { caseId: request.caseId } },
          body: { move: request.move },
        }),
      )
    case 'settle_transfer':
      return payload(
        api.POST('/api/admin/transfers/{transferId}/settle', {
          params: { path: { transferId: request.transferId } },
        }),
      )
    case 'send_notification': {
      const { action: _action, caseId, ...body } = request
      return payload(
        api.POST('/api/admin/cases/{caseId}/notifications', {
          params: { path: { caseId } },
          body: compact(body),
        }),
      )
    }
    case 'set_kill_switch':
      return payload(api.PUT('/api/admin/kill-switch', { body: { enabled: request.enabled } }))
    case 'set_persona': {
      const { action: _action, ...body } = request
      return payload(api.PUT('/api/admin/persona', { body: compact(body) }))
    }
    case 'preview_persona': {
      const { action: _action, ...body } = request
      return payload(api.POST('/api/admin/persona/preview', { body: compact(body) }))
    }
    case 'test_guardrail':
      return payload(api.POST('/api/admin/guardrails/test', { body: { message: request.message } }))
    case 'list_products':
      return payload(api.GET('/api/admin/products'))
    case 'set_product':
      return payload(
        api.PUT('/api/admin/products/{id}', {
          params: { path: { id: request.id } },
          body: compact({ product: request.product, enabled: request.enabled }),
        }),
      )
    case 'delete_product':
      return payload(
        api.DELETE('/api/admin/products/{id}', { params: { path: { id: request.id } } }),
      )
    case 'load_published_products':
      return payload(api.POST('/api/admin/products/load-published'))
    case 'restore_published_product':
      return payload(
        api.POST('/api/admin/products/{id}/restore', { params: { path: { id: request.id } } }),
      )
    case 'list_rates':
      return payload(api.GET('/api/admin/rates'))
    case 'set_rate':
      return payload(
        api.PUT('/api/admin/rates/{id}', {
          params: { path: { id: request.id } },
          body: compact({ rate: request.rate, enabled: request.enabled }),
        }),
      )
    case 'delete_rate':
      return payload(api.DELETE('/api/admin/rates/{id}', { params: { path: { id: request.id } } }))
    case 'load_published_rates':
      return payload(api.POST('/api/admin/rates/load-published'))
    case 'restore_published_rate':
      return payload(
        api.POST('/api/admin/rates/{id}/restore', { params: { path: { id: request.id } } }),
      )
    case 'catalogue_overrides':
      return payload(api.GET('/api/admin/catalogue-overrides'))
    case 'set_catalogue_override': {
      const { action: _action, kind, entryId, ...body } = request
      return payload(
        api.PUT('/api/admin/catalogue-overrides/{kind}/{entryId}', {
          params: { path: { kind, entryId } },
          body: compact(body),
        }),
      )
    }
    case 'clear_catalogue_override':
      return payload(
        api.DELETE('/api/admin/catalogue-overrides/{kind}/{entryId}', {
          params: { path: { kind: request.kind, entryId: request.entryId } },
        }),
      )
    case 'list_form_applications':
      return payload(api.GET('/api/admin/form-applications'))
    case 'inspect_form_application':
      return payload(
        api.GET('/api/admin/form-applications/{formApplicationId}', {
          params: { path: { formApplicationId: request.formApplicationId } },
        }),
      )
    case 'rebuild_form_applications':
      return payload(api.POST('/api/admin/form-applications/rebuild'))
    default:
      return assertNever(request)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled admin action: ${JSON.stringify(value)}`)
}

/** The market data the console verifies: every version, so each product's history is to hand. */
export function listMarketProducts(): Promise<unknown> {
  return payload(api.GET('/api/admin/market-products', { params: { query: { history: 'true' } } }))
}

/** The market as the comparison engine sees it: one view per product. */
export function listMarketViews(): Promise<unknown> {
  return payload(api.GET('/api/admin/market/views'))
}
