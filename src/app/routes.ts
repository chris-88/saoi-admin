/**
 * Every screen's path in one place. Hash routing: GitHub Pages has no rewrites.
 *
 * The console was `/#/admin/*` inside the customer app until the split; it sits at the root of
 * admin.saoi.ie now, and `/admin/*` here redirects to the same screen without the prefix.
 */
export const routes = {
  admin: {
    root: '/',
    case: (caseId: string) => `/case/${caseId}`,
    guardrails: '/guardrails',
    persona: '/persona',
    engine: '/engine',
    catalogue: '/catalogue',
    analytics: '/analytics',
    forms: '/forms',
    formApplication: (id: string) => `/forms/${id}`,
    /** §44: what people said about it, and who asked to work on it. */
    feedback: '/feedback',
    collaborators: '/collaborators',
    profile: '/profile',
  },
} as const
