#!/usr/bin/env bash
#
# Prints a Descope session JWT you can paste into Swagger's Authorize box.
#
# Why this exists: the ID card API verifies token signatures against Descope's
# public keys, so there is no way to hand-craft a token it will accept. A real
# token has to come from your Descope project. Nothing here needs Descope
# support or a sales conversation — it is all self-serve inside your own project
# with a management key.
#
# How it works: Descope test users can have their OTP code read back through the
# management API instead of being emailed. So the three calls below are the whole
# of "log in as a member", with no inbox involved:
#
#   1. create (or re-create) a test user
#   2. generate an OTP code for it, returned in the response
#   3. verify that code, which returns a real session JWT
#
# The resulting token is exactly what the mobile app would send. It is also
# short-lived — minutes, not hours. When a request that worked five minutes ago
# starts returning 401, re-run this rather than going looking for a bug.
#
# Usage:
#   export DESCOPE_PROJECT_ID=P2...
#   export DESCOPE_MANAGEMENT_KEY=K2...        # Company -> Management Keys
#   ./get-test-token.sh [login-id]
#
# The management key can create and delete users in your project. Keep it in an
# environment variable or a secret store, never in this repository — the same
# rule the connector key follows in docs/dotnet-registration-api.md.

set -euo pipefail

LOGIN_ID="${1:-pilot-tester@example.com}"
BASE_URL="${DESCOPE_BASE_URL:-https://api.descope.com}"

if [[ -z "${DESCOPE_PROJECT_ID:-}" ]]; then
  echo "DESCOPE_PROJECT_ID is not set. Copy it from https://app.descope.com/settings/project" >&2
  exit 1
fi

if [[ -z "${DESCOPE_MANAGEMENT_KEY:-}" ]]; then
  echo "DESCOPE_MANAGEMENT_KEY is not set. Create one under Company -> Management Keys." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq / apt install jq)." >&2
  exit 1
fi

MGMT_AUTH="Authorization: Bearer ${DESCOPE_PROJECT_ID}:${DESCOPE_MANAGEMENT_KEY}"
PROJECT_AUTH="Authorization: Bearer ${DESCOPE_PROJECT_ID}"

echo "Creating test user ${LOGIN_ID} ..." >&2
# 'test: true' is the load-bearing field. Without it the OTP is emailed and the
# generate-OTP call below refuses. Failure here is usually "user already exists",
# which is fine — hence the tolerated non-zero exit.
curl -sS -X POST "${BASE_URL}/v1/mgmt/user/create" \
  -H "${MGMT_AUTH}" \
  -H 'Content-Type: application/json' \
  -d "{\"loginId\":\"${LOGIN_ID}\",\"email\":\"${LOGIN_ID}\",\"verifiedEmail\":true,\"test\":true}" \
  >/dev/null || true

echo "Generating an OTP code (no email is sent) ..." >&2
OTP_RESPONSE=$(curl -sS -X POST "${BASE_URL}/v1/mgmt/tests/generate/otp" \
  -H "${MGMT_AUTH}" \
  -H 'Content-Type: application/json' \
  -d "{\"loginId\":\"${LOGIN_ID}\",\"deliveryMethod\":\"email\"}")

CODE=$(echo "${OTP_RESPONSE}" | jq -r '.code // empty')

if [[ -z "${CODE}" ]]; then
  echo "Could not read an OTP code from Descope. Response was:" >&2
  echo "${OTP_RESPONSE}" >&2
  exit 1
fi

echo "Exchanging the code for a session token ..." >&2
# Note the different credential: this is the public auth endpoint the app itself
# calls, authorized with the project id alone. The management key is not used
# here and must not be sent to it.
SESSION_RESPONSE=$(curl -sS -X POST "${BASE_URL}/v1/auth/otp/verify/email" \
  -H "${PROJECT_AUTH}" \
  -H 'Content-Type: application/json' \
  -d "{\"loginId\":\"${LOGIN_ID}\",\"code\":\"${CODE}\"}")

SESSION_JWT=$(echo "${SESSION_RESPONSE}" | jq -r '.sessionJwt // empty')

if [[ -z "${SESSION_JWT}" ]]; then
  echo "No sessionJwt in the response. Response was:" >&2
  echo "${SESSION_RESPONSE}" >&2
  exit 1
fi

# Decode the payload so you can see the two values that matter: 'sub', which the
# API maps to a member, and 'iss', which must match what the API is configured
# to accept. Base64url needs padding restored before base64 -d will take it.
PAYLOAD=$(echo "${SESSION_JWT}" | cut -d. -f2 | tr '_-' '/+')
case $(( ${#PAYLOAD} % 4 )) in
  2) PAYLOAD="${PAYLOAD}==" ;;
  3) PAYLOAD="${PAYLOAD}=" ;;
esac

{
  echo
  echo "Token claims:"
  echo "${PAYLOAD}" | base64 -d 2>/dev/null | jq '{sub, iss, exp, amr}' || echo "  (could not decode)"
  echo
  echo "Add this line to src/PilotApi.Api/appsettings.Development.json so the API"
  echo "maps this user to the seeded member:"
  echo
  echo "  \"Pilot\": { \"SubjectToMemberMap\": { \"$(echo "${PAYLOAD}" | base64 -d 2>/dev/null | jq -r '.sub')\": \"member-alice\" } }"
  echo
  echo "Session token (paste into Swagger's Authorize box):"
} >&2

echo "${SESSION_JWT}"
