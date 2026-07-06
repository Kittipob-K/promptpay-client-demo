#!/bin/bash

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-192.168.1.50}"
REMOTE_USER="${REMOTE_USER:-alphabet88}"
REMOTE_PATH="${REMOTE_PATH:-/home/alphabet88/promptpay-client-demo}"
PROJECT_NAME="${PROJECT_NAME:-promptpay-client-demo}"
CONTAINER_NAME="${CONTAINER_NAME:-promptpay-client-demo}"
NETWORK_NAME="${NETWORK_NAME:-notibank-net}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env}"
ENV_FILE="${ENV_FILE:-.env.casaos}"
DEMO_PORT="${DEMO_PORT:-25455}"
APP_PORT="${APP_PORT:-3002}"
API_BASE="${API_BASE:-https://api-notibank.jesthai.online}"
DEMO_PUBLIC_URL="${DEMO_PUBLIC_URL:-}"
ARCHIVE_NAME="${PROJECT_NAME}.tar.gz"
STAGING_DIR=""
PUSH_ENV=0
SKIP_SMOKE=0
DRY_RUN=0

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

usage() {
  cat <<EOF
Usage: ./deploy-casaos.sh [options]

Options:
  --host HOST          CasaOS host (default: ${REMOTE_HOST})
  --user USER          SSH user (default: ${REMOTE_USER})
  --path PATH          Remote path (default: ${REMOTE_PATH})
  --push-env           Copy ${LOCAL_ENV_FILE} to remote ${ENV_FILE}
  --env-file FILE      Local env file used with --push-env
  --demo-port PORT     External demo port (default: ${DEMO_PORT})
  --app-port PORT      Internal Express port (default: ${APP_PORT})
  --api-base URL       NotiBank API base (default: ${API_BASE})
  --public-url URL     Public demo URL for smoke output
  --skip-smoke         Skip HTTP smoke test
  --dry-run            Print planned steps without running them
  --help               Show this help text

Examples:
  bash deploy-casaos.sh --push-env
  bash deploy-casaos.sh --push-env --public-url https://demo.example.com
  bash deploy-casaos.sh --demo-port 25455 --api-base https://api-notibank.jesthai.online --dry-run
EOF
}

require_value() {
  [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
}

cleanup() {
  [ -n "${STAGING_DIR}" ] && [ -d "${STAGING_DIR}" ] && rm -rf "${STAGING_DIR}"
  rm -f "${ARCHIVE_NAME}"
}
trap cleanup EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --host) require_value "$@"; REMOTE_HOST="$2"; shift ;;
    --user) require_value "$@"; REMOTE_USER="$2"; shift ;;
    --path) require_value "$@"; REMOTE_PATH="$2"; shift ;;
    --push-env) PUSH_ENV=1 ;;
    --env-file) require_value "$@"; LOCAL_ENV_FILE="$2"; shift ;;
    --demo-port) require_value "$@"; DEMO_PORT="$2"; shift ;;
    --app-port) require_value "$@"; APP_PORT="$2"; shift ;;
    --api-base) require_value "$@"; API_BASE="$2"; shift ;;
    --public-url) require_value "$@"; DEMO_PUBLIC_URL="$2"; shift ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

[ "${PUSH_ENV}" = "0" ] || [ -f "${LOCAL_ENV_FILE}" ] || {
  echo "Missing env file: ${LOCAL_ENV_FILE}"
  exit 1
}

echo -e "${GREEN}=== Deploy PromptPay Client Demo ===${NC}"
echo "Remote: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
echo "API base: ${API_BASE}"
[ "${DRY_RUN}" = "0" ] || {
  echo "Dry run only"
  echo "[1/5] Upload source archive to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
  [ "${PUSH_ENV}" = "0" ] || echo "[2/5] Upload env file ${LOCAL_ENV_FILE} -> ${ENV_FILE}"
  [ "${PUSH_ENV}" = "1" ] || echo "[2/5] Reuse remote env ${REMOTE_PATH}/${ENV_FILE}"
  echo "[3/5] Write docker-compose.yml with DEMO_PORT=${DEMO_PORT}, APP_PORT=${APP_PORT}"
  echo "[4/5] docker compose up -d --build --force-recreate --remove-orphans"
  [ "${SKIP_SMOKE}" = "1" ] && echo "[5/5] Smoke test skipped" || echo "[5/5] Smoke test http://localhost:${DEMO_PORT}/"
  echo "Webhook URL should be: ${DEMO_PUBLIC_URL:-http://${REMOTE_HOST}:${DEMO_PORT}}/webhook"
  exit 0
}

STAGING_DIR="$(mktemp -d)"
mkdir -p "${STAGING_DIR}/${PROJECT_NAME}"
cp package.json package-lock.json index.js connector-client.js Dockerfile "${STAGING_DIR}/${PROJECT_NAME}/"
cp -R public "${STAGING_DIR}/${PROJECT_NAME}/public"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "${ARCHIVE_NAME}" -C "${STAGING_DIR}" "${PROJECT_NAME}"

echo -e "${YELLOW}[1/5] Uploading source...${NC}"
scp "${ARCHIVE_NAME}" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "REMOTE_PATH='${REMOTE_PATH}' PROJECT_NAME='${PROJECT_NAME}' ENV_FILE='${ENV_FILE}' bash -s" <<'ENDSSH'
set -euo pipefail
mkdir -p "${REMOTE_PATH}"
find "${REMOTE_PATH}" -mindepth 1 ! -name "${ENV_FILE}" -exec rm -rf {} +
tar -xzf "/tmp/${PROJECT_NAME}.tar.gz" -C "${REMOTE_PATH}" --strip-components=1
rm "/tmp/${PROJECT_NAME}.tar.gz"
ENDSSH

if [ "${PUSH_ENV}" = "1" ]; then
  echo -e "${YELLOW}[2/5] Uploading env...${NC}"
  scp "${LOCAL_ENV_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/${PROJECT_NAME}.env"
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "REMOTE_PATH='${REMOTE_PATH}' ENV_FILE='${ENV_FILE}' PROJECT_NAME='${PROJECT_NAME}' bash -s" <<'ENDSSH'
set -euo pipefail
mv "/tmp/${PROJECT_NAME}.env" "${REMOTE_PATH}/${ENV_FILE}"
chmod 600 "${REMOTE_PATH}/${ENV_FILE}"
ENDSSH
else
  echo -e "${YELLOW}[2/5] Checking env...${NC}"
  if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "test -f '${REMOTE_PATH}/${ENV_FILE}'"; then
    echo "Missing remote env: ${REMOTE_PATH}/${ENV_FILE}"
    echo "First deploy needs env upload:"
    echo "  ./deploy-casaos.sh --push-env"
    exit 1
  fi
fi

echo -e "${YELLOW}[3/5] Writing compose...${NC}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "REMOTE_PATH='${REMOTE_PATH}' ENV_FILE='${ENV_FILE}' PROJECT_NAME='${PROJECT_NAME}' CONTAINER_NAME='${CONTAINER_NAME}' NETWORK_NAME='${NETWORK_NAME}' DEMO_PORT='${DEMO_PORT}' APP_PORT='${APP_PORT}' API_BASE='${API_BASE}' bash -s" <<'ENDSSH'
set -euo pipefail
cd "${REMOTE_PATH}"
set_env(){ k="$1"; v="$2"; grep -q "^${k}=" "${ENV_FILE}" && sed -i "s|^${k}=.*|${k}=${v}|" "${ENV_FILE}" || printf '%s=%s\n' "${k}" "${v}" >> "${ENV_FILE}"; }
set_env PORT "${APP_PORT}"
set_env API_BASE "${API_BASE}"
cat > docker-compose.yml <<EOF
name: ${PROJECT_NAME}
services:
  demo:
    container_name: ${CONTAINER_NAME}
    image: ${PROJECT_NAME}:latest
    build:
      context: .
    ports:
      - "\${DEMO_PORT:-${DEMO_PORT}}:\${PORT:-${APP_PORT}}"
    env_file:
      - ${ENV_FILE}
    environment:
      - PORT=\${PORT:-${APP_PORT}}
      - API_BASE=\${API_BASE:-${API_BASE}}
    networks:
      - ${NETWORK_NAME}
    restart: unless-stopped
networks:
  ${NETWORK_NAME}:
    name: ${NETWORK_NAME}
    external: true
EOF
docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1 || docker network create "${NETWORK_NAME}"
ENDSSH

echo -e "${YELLOW}[4/5] Building container...${NC}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "cd '${REMOTE_PATH}' && DEMO_PORT='${DEMO_PORT}' docker compose --env-file '${ENV_FILE}' -p '${PROJECT_NAME}' up -d --build --force-recreate --remove-orphans && docker compose --env-file '${ENV_FILE}' -p '${PROJECT_NAME}' ps"

echo -e "${YELLOW}[5/5] Smoke test...${NC}"
if [ "${SKIP_SMOKE}" = "1" ]; then
  echo "Skipped"
else
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "DEMO_PORT='${DEMO_PORT}' bash -s" <<'ENDSSH'
set -euo pipefail
for _ in 1 2 3 4 5; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${DEMO_PORT}/" || true)"
  [ "${CODE}" = "200" ] && break
  sleep 2
done
[ "${CODE}" = "200" ] || { echo "Demo smoke failed: ${CODE}"; exit 1; }
echo "Demo OK (${CODE})"
ENDSSH
fi

echo -e "${GREEN}Deploy complete: ${CONTAINER_NAME}${NC}"
[ -z "${DEMO_PUBLIC_URL}" ] || echo "Open: ${DEMO_PUBLIC_URL}"
echo "Webhook URL should be: ${DEMO_PUBLIC_URL:-http://${REMOTE_HOST}:${DEMO_PORT}}/webhook"
