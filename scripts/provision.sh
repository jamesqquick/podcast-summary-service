#!/usr/bin/env bash
#
# One-shot provisioning for the Podcast Summary Service.
#
# Prerequisites (one of):
#   - `wrangler login` has been run interactively, OR
#   - CLOUDFLARE_API_TOKEN is exported
# And, to disambiguate the target account non-interactively:
#   - CLOUDFLARE_ACCOUNT_ID is exported (e.g. the Developer Relations account id)
#
# Usage:
#   CLOUDFLARE_ACCOUNT_ID=xxxx ./scripts/provision.sh
#
# Idempotent: re-running skips buckets that already exist and re-deploys.

set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="podcast-summary-episodes"
PREVIEW_BUCKET="podcast-summary-episodes-preview"

log() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "warning: CLOUDFLARE_ACCOUNT_ID is not set. If your login has multiple" >&2
  echo "         accounts, wrangler will fail to pick one non-interactively." >&2
fi

create_bucket() {
  local name="$1"
  local out
  log "Creating R2 bucket: ${name}"
  if out="$(pnpm exec wrangler r2 bucket create "${name}" 2>&1)"; then
    echo "${out}"
  elif grep -qiE "already (exists|owned)" <<<"${out}"; then
    echo "  (already exists — skipping)"
  else
    echo "${out}" >&2
    echo "error: failed to create bucket ${name}" >&2
    return 1
  fi
}

create_bucket "${BUCKET}"
create_bucket "${PREVIEW_BUCKET}"

log "Deploying Worker, Workflow, and bindings"
pnpm run deploy

log "Setting API_TOKEN secret"
if [[ -n "${API_TOKEN:-}" ]]; then
  printf "%s" "${API_TOKEN}" | pnpm exec wrangler secret put API_TOKEN
  echo "  (used API_TOKEN from environment)"
else
  GENERATED="$(openssl rand -hex 32)"
  printf "%s" "${GENERATED}" | pnpm exec wrangler secret put API_TOKEN
  echo ""
  echo "  Generated API_TOKEN (store this — it is shown only once):"
  echo "    ${GENERATED}"
fi

log "Done. Test with:"
echo "  curl -X POST <worker-url>/episodes \\"
echo "    -H \"Authorization: Bearer \$API_TOKEN\" \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"links\":[\"https://blog.cloudflare.com/\"]}'"
