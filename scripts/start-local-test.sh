#!/bin/bash
# ============================================================
# Katab Platform — 로컬 테스트 전체 구동 스크립트
# Runner는 Dashboard에서 수동으로 시작합니다.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo "  Katab Platform — Local Test Setup"
echo "============================================"

# ---- 0) 기존 프로세스 정리 ----
echo ""
echo "[0/5] Cleaning up existing processes..."

# Kill ALL nest/node processes related to this project
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "cloud-orchestrator/dist/main" 2>/dev/null || true
pkill -f "ts-node.*local-runner" 2>/dev/null || true
sudo pkill -f "pymobiledevice3 remote start-tunnel" 2>/dev/null || true

# Kill anything on our ports (4000=API, 3001=Dashboard, 5001=Runner)
# NOTE: KCD Dashboard runs on 3001 (vite.config.ts), NOT 3000.
#       Port 3000 is reserved for Katab_Stack local dashboard.
for PORT in 4000 3001 5001; do
  lsof -ti :$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 2

# Verify ports are free
for PORT in 4000 3001; do
  if lsof -ti :$PORT >/dev/null 2>&1; then
    echo "  WARNING: Port $PORT still in use. Force-killing..."
    lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# ---- 1) 인프라: PostgreSQL + Redis (Docker) ----
echo ""
echo "[1/5] Starting PostgreSQL + Redis via Docker..."

PG_RUNNING=false
if lsof -ti :5432 >/dev/null 2>&1; then
  echo "  PostgreSQL already running on :5432"
  PG_RUNNING=true
else
  docker rm -f katab-pg 2>/dev/null || true
  docker run -d --name katab-pg \
    -e POSTGRES_USER=katab \
    -e POSTGRES_PASSWORD=katab_secret \
    -e POSTGRES_DB=katab_orchestrator \
    -p 5432:5432 postgres:16
  echo "  Started katab-pg"
fi

REDIS_RUNNING=false
if lsof -ti :6379 >/dev/null 2>&1; then
  echo "  Redis already running on :6379"
  REDIS_RUNNING=true
else
  docker rm -f katab-redis 2>/dev/null || true
  docker run -d --name katab-redis \
    -p 6379:6379 redis:7
  echo "  Started katab-redis"
fi

echo "  Waiting for PostgreSQL..."
for i in $(seq 1 15); do
  pg_isready -h localhost -U katab -q 2>/dev/null && break
  docker exec katab-pg pg_isready -U katab -q 2>/dev/null && break
  docker exec katab-platform-postgres-1 pg_isready -U katab -q 2>/dev/null && break
  sleep 1
done
echo "  PostgreSQL ready."

# ---- 2) Cloud Orchestrator 의존성 + 마이그레이션 ----
echo ""
echo "[2/5] Cloud Orchestrator — install + migrate..."

cd "$ROOT_DIR/cloud-orchestrator"
npm install --silent
npm run build 2>/dev/null || true
npm run migration:run 2>&1 | tail -2

echo ""
echo "[2.5/5] Local Runner — install dependencies..."
cd "$ROOT_DIR/local-runner"
npm install --silent
npx playwright install chromium 2>/dev/null || echo "  (Playwright chromium install skipped)"

# ---- 3) Cloud Orchestrator 실행 (백그라운드) ----
echo ""
echo "[3/5] Starting Cloud Orchestrator on :4000..."
echo "  (Runners are marked offline on startup — start via dashboard)"

# iOS support: pass through Xcode signing env vars to runner processes
# These are inherited by child runner processes via process.env spread
export XCODE_ORG_ID="${XCODE_ORG_ID:-}"
export XCODE_SIGNING_ID="${XCODE_SIGNING_ID:-Apple Development}"
export WDA_BUNDLE_ID="${WDA_BUNDLE_ID:-com.katab.WebDriverAgentRunner}"
export DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/tmp/katab-wda-direct}"
export TUNNEL_SCRIPT_PATH="${TUNNEL_SCRIPT_PATH:-$HOME/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs}"

# ─── iOS CoreDevice Tunnel (iOS 17+) ───
# Required for Appium to communicate with WDA on real iOS devices.
# The tunnel requires root privileges (sudo). Runs in background for the session.
IOS_DEVICE_COUNT=$(idevice_id -l 2>/dev/null | wc -l | tr -d ' ')
if [ "$IOS_DEVICE_COUNT" -gt 0 ] 2>/dev/null; then
  echo "  iOS device(s) detected ($IOS_DEVICE_COUNT). Starting CoreDevice tunnel..."
  # Kill any existing tunnel
  sudo pkill -f "pymobiledevice3 remote start-tunnel" 2>/dev/null || true
  sleep 1
  sudo pymobiledevice3 remote start-tunnel > /tmp/katab-tunnel.log 2>&1 &
  TUNNEL_PID=$!
  echo "  CoreDevice tunnel PID: $TUNNEL_PID (log: /tmp/katab-tunnel.log)"
  sleep 3
  if kill -0 $TUNNEL_PID 2>/dev/null; then
    echo "  CoreDevice tunnel running."
  else
    echo "  WARNING: CoreDevice tunnel failed to start. iOS sessions may not work."
    echo "  Check: cat /tmp/katab-tunnel.log"
  fi
else
  echo "  No iOS devices detected. Skipping CoreDevice tunnel."
fi

cd "$ROOT_DIR/cloud-orchestrator"
npm run start:dev > /tmp/katab-cloud.log 2>&1 &
CLOUD_PID=$!
echo "  PID: $CLOUD_PID (log: /tmp/katab-cloud.log)"

# API가 뜰 때까지 대기 (nest --watch compiles first, so allow up to 60s)
echo "  Waiting for API..."
API_READY=false
for i in $(seq 1 60); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/v1/auth/sign-in 2>/dev/null || true)
  if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "" ]; then
    API_READY=true
    break
  fi
  # Check if the process died
  if ! kill -0 "$CLOUD_PID" 2>/dev/null; then
    echo "  ERROR: Cloud Orchestrator process died."
    echo "  Last 20 lines of log:"
    tail -20 /tmp/katab-cloud.log
    exit 1
  fi
  sleep 1
done

if [ "$API_READY" = "false" ]; then
  echo "  ERROR: API did not start within 60 seconds."
  tail -20 /tmp/katab-cloud.log
  exit 1
fi
echo "  Cloud Orchestrator ready."

# ---- 4) 계정 생성 + Runner 등록 ----
echo ""
echo "[4/5] Creating account + registering runner..."

# 회원가입 (이미 존재하면 409 — 무시)
SIGNUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@katab.io","password":"password123","name":"Admin","tenantName":"My QA Team"}' 2>/dev/null)

if [ "$SIGNUP_CODE" = "201" ]; then
  echo "  Sign-up: new account created"
elif [ "$SIGNUP_CODE" = "409" ]; then
  echo "  Sign-up: account already exists (OK)"
else
  echo "  Sign-up: HTTP $SIGNUP_CODE"
fi

# 로그인
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/v1/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@katab.io","password":"password123"}' 2>/dev/null)

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  ERROR: Could not get JWT token."
  echo "  Response: $LOGIN_RESPONSE"
  echo "  Check cloud-orchestrator logs: tail -50 /tmp/katab-cloud.log"
  exit 1
fi
echo "  JWT Token: ${TOKEN:0:20}..."

# Check if runners already exist
RUNNERS=$(curl -s http://localhost:4000/api/v1/account/runners \
  -H "Authorization: Bearer $TOKEN")
RUNNER_COUNT=$(echo "$RUNNERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$RUNNER_COUNT" = "0" ] || [ -z "$RUNNER_COUNT" ]; then
  # No runners — create one. Detect platform from connected devices.
  IOS_COUNT=$(idevice_id -l 2>/dev/null | wc -l | tr -d ' ')
  ADB_COUNT=$(adb devices 2>/dev/null | grep -cw 'device' || echo "0")

  if [ "$IOS_COUNT" -gt 0 ] 2>/dev/null; then
    RUNNER_NAME="ios-runner"
    RUNNER_PLATFORM="ios"
  elif [ "$ADB_COUNT" -gt 0 ] 2>/dev/null; then
    RUNNER_NAME="android-runner"
    RUNNER_PLATFORM="android"
  else
    RUNNER_NAME="web-runner"
    RUNNER_PLATFORM="web"
  fi

  echo "  Creating $RUNNER_NAME (platform: $RUNNER_PLATFORM)..."
  RUNNER_RESULT=$(curl -s -X POST http://localhost:4000/api/v1/account/runners \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\":\"$RUNNER_NAME\",\"platform\":\"$RUNNER_PLATFORM\"}")
  echo "  Runner created (auto-started by Cloud Orchestrator)"
  sleep 3
else
  echo "  Found $RUNNER_COUNT existing runner(s)."

  # Clean up duplicates: keep only the first runner, delete the rest
  FIRST_RUNNER_ID=$(echo "$RUNNERS" | python3 -c "
import sys,json
try:
  data = json.load(sys.stdin)
  if data: print(data[0]['id'])
except: pass
" 2>/dev/null)

  if [ "$RUNNER_COUNT" -gt 1 ] 2>/dev/null; then
    echo "  Cleaning up duplicate runners (keeping 1)..."
    echo "$RUNNERS" | python3 -c "
import sys,json
try:
  data = json.load(sys.stdin)
  for r in data[1:]:
    print(r['id'])
except: pass
" 2>/dev/null | while read RID; do
      curl -s -o /dev/null -X DELETE "http://localhost:4000/api/v1/account/runners/$RID" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null
      echo "    Deleted runner ${RID:0:8}"
    done
  fi

  # Start the remaining runner
  if [ -n "$FIRST_RUNNER_ID" ]; then
    echo "  Starting runner ${FIRST_RUNNER_ID:0:8}..."
    START_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:4000/api/v1/account/runners/$FIRST_RUNNER_ID/start" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    if [ "$START_CODE" = "201" ] || [ "$START_CODE" = "200" ]; then
      echo "    Started runner ${FIRST_RUNNER_ID:0:8}"
    else
      echo "    Runner ${FIRST_RUNNER_ID:0:8}: HTTP $START_CODE (may already be running)"
    fi
  fi
  sleep 3
fi

# ---- 5) Dashboard 실행 ----
echo ""
echo "[5/5] Starting Dashboard on :3001..."

cd "$ROOT_DIR/dashboard"
npm install --silent
npm run dev > /tmp/katab-dashboard.log 2>&1 &
DASH_PID=$!
echo "  PID: $DASH_PID (log: /tmp/katab-dashboard.log)"

# Dashboard 준비 대기
sleep 3

# ---- 완료 ----
echo ""
echo "============================================"
echo "  All services running!"
echo "============================================"
echo ""
echo "  Cloud Dashboard : http://localhost:3001"
echo "    Login: admin@katab.io / password123"
echo ""
echo "  Cloud API       : http://localhost:4000"
echo "    Swagger Docs  : http://localhost:4000/docs"
echo ""
echo "  NOTE: Katab_Stack dashboard (port 3000) can run simultaneously."
echo ""
echo "  Runners are managed via Dashboard."
echo "    Go to Runners page -> click Start to spawn runner."
echo ""
echo "  PIDs: Cloud=$CLOUD_PID  Dashboard=$DASH_PID"
echo ""
echo "  Stop all:"
echo "    kill $CLOUD_PID $DASH_PID"
echo "    pkill -f 'nest start --watch'"
echo "    sudo pkill -f 'pymobiledevice3 remote start-tunnel'"
echo "    docker stop katab-pg katab-redis"
echo ""
echo "============================================"

# Disable set -e for wait (background processes may exit non-zero on file changes)
set +e
wait
