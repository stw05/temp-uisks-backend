#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
EMAIL="admin$(date +%s)@example.com"
PASSWORD="supersecret123"

echo "Docs status: $(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/docs")"
echo "Docs JSON status: $(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/docs-json")"

REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Admin\",\"role\":\"admin\"}")

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(node -e "const d=JSON.parse(process.argv[1]);console.log(d.token||'')" "$LOGIN_RESPONSE")

if [[ -z "$TOKEN" ]]; then
  echo "Failed: no token from login"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "Me status: $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/me")"

echo "Create project status: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/projects" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"id":"tmp-project-smoke","title":"Temp Project","lead":"Lead","region":"Астана","status":"active","budget":1000,"spent":0,"startDate":"2026-01-01","endDate":"2026-12-31","tags":[]}')"

PROJECTS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/projects?page=1&limit=5")
PROJECTS_META_PAGE=$(node -e "const d=JSON.parse(process.argv[1]);console.log(d?.meta?.page ?? '')" "$PROJECTS_RESPONSE")

if [[ "$PROJECTS_META_PAGE" != "1" ]]; then
  echo "Failed: pagination response does not contain expected meta.page"
  echo "$PROJECTS_RESPONSE"
  exit 1
fi

echo "Projects pagination status: ok"

echo "Logout status: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/logout")"
echo "Me after logout status: $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/me")"

echo "Smoke test completed"
