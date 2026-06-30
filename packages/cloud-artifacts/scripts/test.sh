#!/usr/bin/env bash
# cloud-artifacts 端到端测试脚本
# 用法：
#   WORKER_URL=https://cloud-artifacts.claude-code-best.workers.dev \
#   TOKEN=claude-code-best \
#   bash scripts/test.sh
#
# 如本机连不上 workers.dev，可通过代理：
#   HTTPS_PROXY=http://127.0.0.1:7890 bash scripts/test.sh ...

set -uo pipefail

WORKER_URL="${WORKER_URL:-https://cloud-artifacts.claude-code-best.win}"
TOKEN="${TOKEN:-claude-code-best}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 颜色
G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; D=$'\033[0m'

# 准备测试 html
echo '<!doctype html><title>t</title><h1>hello v1</h1>' > "$TMP/v1.html"
echo '<!doctype html><title>t</title><h1>hello v2 (overwritten)</h1>' > "$TMP/v2.html"

# 11MB 的 html（用于 413 测试）
yes '<p>x</p>' | head -c 11000000 > "$TMP/big.html"

pass=0; fail=0
# expect: 主断言 status code；如代理把所有 status 抹平为 200 但 body 仍是 error JSON，
# 则按 body 中的 error 字段做 fallback 断言（标 [via body]）。
expect() {
  local label="$1" want_code="$2" resp="$3" code="$4" body="$5"
  if [[ "$code" == "$want_code" ]]; then
    printf "${G}✓ %s -> HTTP %s${D}\n" "$label" "$code"
    [[ -n "$resp" ]] && printf "    body: %s\n" "$body"
    pass=$((pass+1))
    return
  fi
  # 代理透传 fallback：HTTP 200 + body 是 {"error":"..."} JSON
  if [[ "$code" == "200" && "$body" == {\"error\":* ]]; then
    local want_error=""
    case "$want_code" in
      401) want_error="unauthorized" ;;
      415) want_error="unsupported_media_type" ;;
      413) want_error="payload_too_large" ;;
      404) want_error="not_found" ;;
      400) want_error="invalid_" ;; # invalid_ttl 或 invalid_hash，前缀匹配
    esac
    if [[ -z "$want_error" ]] || echo "$body" | grep -q "\"error\":\"$want_error"; then
      printf "${G}✓ %s -> HTTP 200 [via body] %s${D}\n" "$label" "$body"
      pass=$((pass+1))
      return
    fi
  fi
  printf "${R}✗ %s -> HTTP %s (expected %s)${D}\n" "$label" "$code" "$want_code"
  printf "    body: %s\n" "$body"
  fail=$((fail+1))
}

call() {
  local label="$1" want="$2"
  shift 2
  curl -sS -o "$TMP/resp" -w "%{http_code}" "$@" > "$TMP/code"
  expect "$label" "$want" "" "$(cat "$TMP/code")" "$(cat "$TMP/resp")"
}

echo "===== 错误用例 ====="

# 1. 401 未授权
call "no token" 401 \
  -X POST "$WORKER_URL/upload" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

# 2. 401 token 错
call "wrong token" 401 \
  -X POST "$WORKER_URL/upload" \
  -H "Authorization: Bearer wrong" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

# 3. 415 错误 MIME
call "wrong content-type" 415 \
  -X POST "$WORKER_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" --data-binary '{"x":1}'

# 4. 400 invalid_ttl
call "ttl=999" 400 \
  -X POST "$WORKER_URL/upload?ttl=999" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

# 5. 400 invalid_ttl (负数)
call "ttl=0" 400 \
  -X POST "$WORKER_URL/upload?ttl=0" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

# 6. 400 invalid_hash
call "hash=bad/slash" 400 \
  -X POST "$WORKER_URL/upload?hash=bad/slash" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

# 7. 413 payload_too_large (11MB > 10MB)
call "11MB body" 413 \
  -X POST "$WORKER_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/big.html"

# 8. 404 not_found (错路径)
call "wrong path" 404 \
  -X POST "$WORKER_URL/notupload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"

echo
echo "===== 成功用例 ====="

# 9. 200 随机 ID + 7 天（默认）
echo "--- 默认上传（随机 ID + 7 天）---"
curl -sS -o "$TMP/resp" -w "HTTP %{http_code}\n" \
  -X POST "$WORKER_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"
cat "$TMP/resp"; echo
RANDOM_ID=$(python3 -c "import json,sys;print(json.load(open('$TMP/resp'))['id'])" 2>/dev/null || echo "")
[[ -n "$RANDOM_ID" ]] && printf "${G}随机 ID: %s${D}\n" "$RANDOM_ID"

# 10. 200 自定义 hash + 30 天
echo "--- 自定义 hash + 30 天 ---"
curl -sS -o "$TMP/resp" -w "HTTP %{http_code}\n" \
  -X POST "$WORKER_URL/upload?ttl=30&hash=test-artifact-v1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v1.html"
cat "$TMP/resp"; echo

# 11. 覆盖（同 hash）
echo "--- 覆盖：同 hash 上传 v2 ---"
curl -sS -o "$TMP/resp" -w "HTTP %{http_code}\n" \
  -X POST "$WORKER_URL/upload?ttl=30&hash=test-artifact-v1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" --data-binary "@$TMP/v2.html"
cat "$TMP/resp"; echo

echo
echo "===== R2 写入验证（不走 CDN，走 Cloudflare API） ====="

# 用 wrangler r2 object get 验证文件实际写入了 R2
if [[ -n "$RANDOM_ID" ]]; then
  echo "--- 验证随机 ID 文件存在: 7d/$RANDOM_ID.html ---"
  npx wrangler r2 object get "cloud-artifacts/7d/$RANDOM_ID.html" --remote --file "$TMP/got.html" 2>&1 | tail -5
  echo "下载内容：" ; cat "$TMP/got.html" 2>/dev/null
fi

echo "--- 验证覆盖后 test-artifact-v1 是 v2 内容 ---"
npx wrangler r2 object get "cloud-artifacts/30d/test-artifact-v1.html" --remote --file "$TMP/got2.html" 2>&1 | tail -5
echo "下载内容：" ; cat "$TMP/got2.html" 2>/dev/null

echo
echo "===== 汇总 ====="
printf "${G}pass=%d${D} ${R}fail=%d${D}\n" "$pass" "$fail"
[[ "$fail" -gt 0 ]] && exit 1 || exit 0
