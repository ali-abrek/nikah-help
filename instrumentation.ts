// Next.js calls register() once per server runtime (Node and Edge).
// We delegate to the dedicated config files so each runtime gets exactly
// the integrations it supports (Replay is browser-only; Node-only modules
// must stay out of the Edge config).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Official Next.js instrumentation hook — captures unhandled errors from route
// handlers, Server Actions, and middleware with full request context.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(error, request, context)
}
