/**
 * Optional AI Gateway integration.
 *
 * When `AI_GATEWAY_ID` is configured, Workers AI calls are routed through the
 * named AI Gateway, adding request logging, token/cost analytics, caching, and
 * rate limiting with no code changes at the call sites. When unset, calls go
 * directly to the Workers AI binding (the default). Use the id `"default"` to
 * have AI Gateway auto-create a gateway on first request.
 */

/** Normalize the configured gateway id: empty/whitespace becomes undefined (off). */
export function resolveGatewayId(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Run-option fragment passed to `AI.run` to route through a gateway. */
export interface GatewayRunOptions {
  gateway?: { id: string };
}

/** Build the gateway run-option fragment, or an empty object when disabled. */
export function gatewayRunOptions(gatewayId: string | undefined): GatewayRunOptions {
  return gatewayId ? { gateway: { id: gatewayId } } : {};
}
