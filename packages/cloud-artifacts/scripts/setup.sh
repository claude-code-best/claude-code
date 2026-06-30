#!/usr/bin/env bash
set -euo pipefail

BUCKET="${BUCKET:-cloud-artifacts}"

echo "==> Creating R2 bucket: $BUCKET"
npx wrangler r2 bucket create "$BUCKET" || echo "(already exists or creation deferred)"

echo "==> Adding lifecycle rule: prefix '7d/' -> expire after 7 days"
npx wrangler r2 bucket lifecycle add "$BUCKET" delete-7d "7d/" --expire-days 7 --force

echo "==> Adding lifecycle rule: prefix '30d/' -> expire after 30 days"
npx wrangler r2 bucket lifecycle add "$BUCKET" delete-30d "30d/" --expire-days 30 --force

echo "==> Setting secret TOKEN (paste value, then Enter)"
npx wrangler secret put TOKEN

cat <<'NEXT'

==> Done. Remaining manual steps:

  1. Bind a custom domain to the Worker (POST + GET 都走 Worker，单一域名):
       Dashboard: Workers & Pages > cloud-artifacts > Settings > Domains & Routes > Add > Custom Domain
       填入你的 domain（如 artifacts.example.com），Cloudflare 会自动加 DNS 记录和 SSL。

  2. Update wrangler.toml [vars] PUBLIC_URL 为上一步的 domain（带 https://，如 https://artifacts.example.com）。

  3. Deploy:
       bun run deploy
NEXT
