#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Katab Central Server — Setup & Management
# ═══════════════════════════════════════════════════════════════
#
#  PC1에 KCP(Control Plane) + KCD(Cloud Dashboard)를 설치/운영합니다.
#
#  사용법:
#    ./setup-server.sh              최초 설치 + 시작
#    ./setup-server.sh start        서비스 시작
#    ./setup-server.sh stop         서비스 중지
#    ./setup-server.sh status       상태 확인
#    ./setup-server.sh logs         로그 보기
#    ./setup-server.sh restart      재시작
#
#  원라인 설치:
#    git clone https://github.com/Dubbi96/KCD.git && cd KCD && ./setup-server.sh
#
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
KCD_DIR="$SCRIPT_DIR"
KCP_DIR="$PARENT_DIR/KCP"
SHARED_DIR="$PARENT_DIR/katab-shared"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${GREEN}[Katab]${NC} $1"; }
warn() { echo -e "${YELLOW}[Katab]${NC} $1"; }
err()  { echo -e "${RED}[Katab]${NC} $1"; }
sep()  { echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"; }

mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── Helper: kill process tree ──────────────────────────────
kill_tree() {
  local pid=$1
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

# ─── Get LAN IP ─────────────────────────────────────────────
get_lan_ip() {
  if command -v ip &>/dev/null; then
    ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}'
  else
    ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}'
  fi
}

# ─── Stop ────────────────────────────────────────────────────
stop_all() {
  log "서비스 중지 중..."
  for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    name=$(basename "$pidfile" .pid)
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
      log "  ${BOLD}$name${NC} 중지 (PID $pid)"
    fi
    rm -f "$pidfile"
  done
  log "전체 서비스 중지 완료."
}

# ─── Status ──────────────────────────────────────────────────
show_status() {
  echo ""
  echo -e "${CYAN}${BOLD}  Katab Central Server — 상태${NC}"
  sep
  echo ""

  for entry in "kcp:KCP Control Plane:4100" "kcd-api:KCD Cloud API:4000" "kcd-dashboard:KCD Dashboard:5173"; do
    IFS=: read -r key name port <<< "$entry"
    local pidfile="$PID_DIR/$key.pid"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo -e "  ${GREEN}●${NC} ${BOLD}$name${NC} — :$port (PID $(cat "$pidfile"))"
    else
      echo -e "  ${RED}○${NC} ${BOLD}$name${NC} — :$port (중지됨)"
    fi
  done

  # Docker PostgreSQL
  echo ""
  for entry in "kcd-postgres:PostgreSQL (KCD):5432" "kcp-postgres:PostgreSQL (KCP):5433"; do
    IFS=: read -r container name port <<< "$entry"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$container"; then
      echo -e "  ${GREEN}●${NC} ${BOLD}$name${NC} — :$port (Docker)"
    elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "$container"; then
      echo -e "  ${RED}○${NC} ${BOLD}$name${NC} — :$port (Docker 중지됨)"
    else
      # fallback: check by port
      if lsof -ti:"$port" &>/dev/null; then
        echo -e "  ${GREEN}●${NC} ${BOLD}$name${NC} — :$port"
      else
        echo -e "  ${RED}○${NC} ${BOLD}$name${NC} — :$port (없음)"
      fi
    fi
  done
  echo ""
}

# ─── Logs ────────────────────────────────────────────────────
show_logs() {
  log "로그 출력 중 (Ctrl+C로 중지)..."
  tail -f "$LOG_DIR"/*.log 2>/dev/null || warn "로그 파일이 없습니다."
}

# ─── Route commands ──────────────────────────────────────────
case "${1:-}" in
  stop)    stop_all; exit 0 ;;
  status)  show_status; exit 0 ;;
  logs)    show_logs; exit 0 ;;
  restart) stop_all; echo "" ;;
  start)   ;; # fall through to start
  "")      ;; # full setup + start
  *)
    err "알 수 없는 명령: $1"
    echo "사용법: $0 [start|stop|status|logs|restart]"
    exit 1
    ;;
esac

# ═══════════════════════════════════════════════════════════════
#  Setup (only on first run or explicit setup)
# ═══════════════════════════════════════════════════════════════

# ─── Banner ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  Katab Central Server — Setup${NC}"
sep
echo -e "  KCP (Control Plane :4100) + KCD (Cloud API :4000 + Dashboard :5173)"
sep
echo ""

# ─── Prerequisite check ─────────────────────────────────────
check_prereqs() {
  local missing=0

  for cmd in node npm git; do
    if ! command -v "$cmd" &>/dev/null; then
      err "$cmd 이 설치되어 있지 않습니다."
      missing=1
    fi
  done

  if ! command -v docker &>/dev/null; then
    warn "Docker가 설치되어 있지 않습니다. PostgreSQL을 수동으로 실행해야 합니다."
  fi

  if [ $missing -eq 1 ]; then
    err "필수 프로그램을 설치한 후 다시 실행하세요."
    exit 1
  fi

  local node_ver
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_ver" -lt 18 ]; then
    err "Node.js 18+ 이 필요합니다 (현재: $(node -v))"
    exit 1
  fi

  log "Node.js $(node -v) 확인"
}
check_prereqs

# ─── Clone sibling repos if needed ──────────────────────────
clone_if_needed() {
  local dir=$1 repo=$2 name=$3
  if [ -d "$dir/.git" ] || [ -d "$dir/src" ]; then
    log "  $name: 이미 존재 ($dir)"
  else
    log "  $name: GitHub에서 클론 중..."
    if ! git clone "$repo" "$dir" 2>&1; then
      err "  $name 클론 실패! 네트워크 또는 권한을 확인하세요."
      err "  URL: $repo"
      exit 1
    fi
    log "  $name: 클론 완료"
  fi
}

if [ "${1:-}" != "start" ]; then
  sep
  log "프로젝트 확인 중..."
  sep
  clone_if_needed "$KCP_DIR" "https://github.com/Dubbi96/KCP.git" "KCP"
  clone_if_needed "$SHARED_DIR" "https://github.com/Dubbi96/katab-shared.git" "katab-shared"
  echo ""
fi

# ─── Start PostgreSQL ───────────────────────────────────────
setup_postgres_brew() {
  # macOS: Homebrew PostgreSQL
  if ! command -v brew &>/dev/null; then
    err "Homebrew가 설치되어 있지 않습니다."
    err "설치: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
  fi

  if ! brew list postgresql@16 &>/dev/null; then
    log "  PostgreSQL 16 설치 중 (Homebrew)..."
    brew install postgresql@16 2>&1 | tail -3
  fi

  # Ensure PostgreSQL is running
  if ! brew services list | grep postgresql@16 | grep -q started; then
    log "  PostgreSQL 서비스 시작..."
    brew services start postgresql@16
    sleep 3
  fi

  log "  PostgreSQL 실행 확인..."
  local retries=0
  while ! pg_isready -h localhost -p 5432 -q 2>/dev/null && [ $retries -lt 10 ]; do
    sleep 2
    retries=$((retries + 1))
  done

  if ! pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    err "PostgreSQL이 시작되지 않았습니다."
    exit 1
  fi

  # Create user and databases if needed
  local pg_user
  pg_user=$(whoami)

  # Create katab role
  psql -h localhost -p 5432 -U "$pg_user" -d postgres -tc \
    "SELECT 1 FROM pg_roles WHERE rolname='katab'" 2>/dev/null | grep -q 1 || \
    psql -h localhost -p 5432 -U "$pg_user" -d postgres -c \
    "CREATE ROLE katab WITH LOGIN PASSWORD 'katab_secret' CREATEDB;" 2>/dev/null || true

  # Create databases
  psql -h localhost -p 5432 -U "$pg_user" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='katab_orchestrator'" 2>/dev/null | grep -q 1 || \
    psql -h localhost -p 5432 -U "$pg_user" -d postgres -c \
    "CREATE DATABASE katab_orchestrator OWNER katab;" 2>/dev/null || true

  psql -h localhost -p 5432 -U "$pg_user" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='katab_control_plane'" 2>/dev/null | grep -q 1 || \
    psql -h localhost -p 5432 -U "$pg_user" -d postgres -c \
    "CREATE DATABASE katab_control_plane OWNER katab;" 2>/dev/null || true

  log "  데이터베이스 준비 완료 (katab_orchestrator, katab_control_plane)"
}

start_databases() {
  sep
  log "PostgreSQL 준비 중..."
  sep

  if command -v docker &>/dev/null; then
    # ── Docker 모드 ──
    log "  Docker 감지 — 컨테이너로 PostgreSQL 실행"

    # Kill stale containers on our ports
    for port in 5432 5433; do
      local blocking
      blocking=$(docker ps --filter "publish=$port" --format "{{.Names}}" 2>/dev/null | head -1)
      if [ -n "$blocking" ]; then
        warn "  포트 $port 점유 컨테이너 '$blocking' 중지 중..."
        docker stop "$blocking" >/dev/null 2>&1 || true
      fi
    done

    log "  KCD PostgreSQL (:5432)..."
    (cd "$KCD_DIR" && docker compose up -d postgres 2>&1 | sed 's/^/    /')

    log "  KCP PostgreSQL (:5433)..."
    (cd "$KCP_DIR" && docker compose up -d postgres 2>&1 | sed 's/^/    /')

    echo ""
    log "데이터베이스 준비 대기 중..."
    local retries=0
    while ! pg_isready -h localhost -p 5432 -U katab -q 2>/dev/null && [ $retries -lt 15 ]; do
      sleep 2; retries=$((retries + 1))
    done
    retries=0
    while ! pg_isready -h localhost -p 5433 -U katab -q 2>/dev/null && [ $retries -lt 15 ]; do
      sleep 2; retries=$((retries + 1))
    done
    log "데이터베이스 준비 완료."

  elif [ "$(uname)" = "Darwin" ]; then
    # ── macOS: Homebrew PostgreSQL ──
    log "  Docker 없음 — Homebrew PostgreSQL 사용"
    setup_postgres_brew

  elif pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    # ── 기존 PostgreSQL 사용 ──
    log "  기존 PostgreSQL 감지 (:5432)"
    warn "  katab_orchestrator, katab_control_plane 데이터베이스가 있는지 확인하세요."

  else
    err "PostgreSQL을 찾을 수 없습니다."
    err "다음 중 하나를 설치하세요:"
    err "  • Docker: https://docs.docker.com/get-docker/"
    err "  • macOS: brew install postgresql@16"
    err "  • Linux: sudo apt install postgresql"
    exit 1
  fi
  echo ""
}
start_databases

# ─── Install & Build ────────────────────────────────────────
if [ "${1:-}" != "start" ]; then
  sep
  log "의존성 설치 및 빌드..."
  sep

  install_if_needed() {
    local dir=$1 name=$2
    if [ ! -d "$dir/node_modules" ]; then
      log "  $name: npm install..."
      (cd "$dir" && npm install --silent 2>&1 | tail -2)
    else
      log "  $name: OK (이미 설치됨)"
    fi
  }

  # 1. katab-shared (공유 라이브러리)
  install_if_needed "$SHARED_DIR" "katab-shared"
  log "  katab-shared 빌드 중..."
  (cd "$SHARED_DIR" && npx tsc 2>&1 | tail -2)

  # 2. KCP
  install_if_needed "$KCP_DIR" "KCP"
  log "  KCP 빌드 중..."
  (cd "$KCP_DIR" && npx tsc 2>&1 | tail -5)
  log "  KCP 빌드 완료"

  # 3. KCD cloud-orchestrator
  install_if_needed "$KCD_DIR/cloud-orchestrator" "KCD (cloud-orchestrator)"
  log "  KCD 빌드 중..."
  (cd "$KCD_DIR/cloud-orchestrator" && npm run build 2>&1 | tail -2)
  log "  KCD 빌드 완료"

  # 4. KCD dashboard
  install_if_needed "$KCD_DIR/dashboard" "KCD (dashboard)"

  echo ""
fi

# ─── Generate .env files (if missing) ───────────────────────
generate_env() {
  local jwt_secret
  jwt_secret=$(openssl rand -hex 32 2>/dev/null || echo "katab-jwt-$(date +%s)")

  # Docker uses separate postgres containers (5432 + 5433)
  # Homebrew/native uses single postgres (both on 5432)
  local kcp_db_port=5432
  if command -v docker &>/dev/null; then
    kcp_db_port=5433
  fi

  if [ ! -f "$KCP_DIR/.env" ]; then
    log "KCP .env 생성 중..."
    cat > "$KCP_DIR/.env" << ENVEOF
DB_HOST=localhost
DB_PORT=$kcp_db_port
DB_USERNAME=katab
DB_PASSWORD=katab_secret
DB_DATABASE=katab_control_plane
JWT_SECRET=$jwt_secret
PORT=4100
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:4000
NODE_HEARTBEAT_TIMEOUT_SEC=90
LEASE_DEFAULT_TTL_SEC=3600
ENVEOF
  fi

  if [ ! -f "$KCD_DIR/cloud-orchestrator/.env" ]; then
    log "KCD .env 생성 중..."
    cat > "$KCD_DIR/cloud-orchestrator/.env" << ENVEOF
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=katab
DB_PASSWORD=katab_secret
DB_DATABASE=katab_orchestrator
JWT_SECRET=$jwt_secret
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
KCP_API_URL=http://localhost:4100/api
ENVEOF
  fi
}
generate_env

# ─── Run KCD migrations ─────────────────────────────────────
if [ "${1:-}" != "start" ]; then
  sep
  log "데이터베이스 마이그레이션..."
  sep
  (cd "$KCD_DIR/cloud-orchestrator" && npm run migration:run 2>&1 | tail -3) || warn "마이그레이션 스킵 (이미 최신일 수 있음)"
  echo ""
fi

# ─── Stop any running services ───────────────────────────────
for pidfile in "$PID_DIR"/*.pid; do
  [ -f "$pidfile" ] || continue
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    kill_tree "$pid"
  fi
  rm -f "$pidfile"
done

# Kill stale processes on service ports
for port in 4000 4100; do
  stale_pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$stale_pid" ]; then
    warn "포트 $port 점유 프로세스 종료 (PID $stale_pid)"
    kill "$stale_pid" 2>/dev/null || true
    sleep 1
  fi
done

# ─── Start KCP ───────────────────────────────────────────────
sep
log "${BOLD}KCP${NC} 시작 중 (Control Plane :4100)..."
sep

(
  cd "$KCP_DIR"
  exec node dist/main.js
) > "$LOG_DIR/kcp.log" 2>&1 &
echo $! > "$PID_DIR/kcp.pid"

sleep 2
if kill -0 "$(cat "$PID_DIR/kcp.pid")" 2>/dev/null; then
  log "  KCP 시작 완료 (PID $(cat "$PID_DIR/kcp.pid"))"
else
  err "  KCP 시작 실패!"
  tail -10 "$LOG_DIR/kcp.log"
  exit 1
fi
echo ""

# ─── Start KCD API ───────────────────────────────────────────
sep
log "${BOLD}KCD API${NC} 시작 중 (Cloud API :4000)..."
sep

(
  cd "$KCD_DIR/cloud-orchestrator"
  exec node dist/main.js
) > "$LOG_DIR/kcd-api.log" 2>&1 &
echo $! > "$PID_DIR/kcd-api.pid"

sleep 2
if kill -0 "$(cat "$PID_DIR/kcd-api.pid")" 2>/dev/null; then
  log "  KCD API 시작 완료 (PID $(cat "$PID_DIR/kcd-api.pid"))"
else
  err "  KCD API 시작 실패!"
  tail -10 "$LOG_DIR/kcd-api.log"
  exit 1
fi
echo ""

# ─── Start KCD Dashboard ────────────────────────────────────
sep
log "${BOLD}KCD Dashboard${NC} 시작 중 (:5173)..."
sep

(
  cd "$KCD_DIR/dashboard"
  exec npx vite --host 2>/dev/null
) > "$LOG_DIR/kcd-dashboard.log" 2>&1 &
echo $! > "$PID_DIR/kcd-dashboard.pid"
log "  Dashboard 시작 (PID $(cat "$PID_DIR/kcd-dashboard.pid"))"
echo ""

# ─── Summary ─────────────────────────────────────────────────
LAN_IP=$(get_lan_ip)
echo ""
sep
echo -e "${CYAN}${BOLD}  Katab Central Server — 실행 중${NC}"
sep
echo ""
echo -e "  ${GREEN}●${NC} ${BOLD}KCP${NC}  Control Plane        http://localhost:4100/api"
echo -e "  ${GREEN}●${NC} ${BOLD}KCD${NC}  Cloud API             http://localhost:4000/api/v1"
echo -e "       Swagger (API 문서)     http://localhost:4000/docs"
echo -e "  ${GREEN}●${NC} ${BOLD}KCD${NC}  Dashboard             http://localhost:5173"
echo ""
sep
echo ""
echo -e "  ${BOLD}기본 계정:${NC}"
echo -e "    Email:    ${BOLD}admin@katab.io${NC}"
echo -e "    Password: ${BOLD}password123${NC}"
echo ""
sep
echo ""
echo -e "  ${BOLD}KRC 노드 연결 (다른 PC에서):${NC}"
echo ""
if [ -n "$LAN_IP" ]; then
  echo -e "    ${CYAN}curl -fsSL https://raw.githubusercontent.com/Dubbi96/KRC/main/setup-node.sh | bash -s -- $LAN_IP${NC}"
else
  echo -e "    ${CYAN}curl -fsSL https://raw.githubusercontent.com/Dubbi96/KRC/main/setup-node.sh | bash -s -- <이 PC의 IP>${NC}"
fi
echo ""
echo -e "    또는 수동 설치:"
echo -e "    ${CYAN}git clone https://github.com/Dubbi96/KRC.git && cd KRC && ./setup-node.sh ${LAN_IP:-<서버IP>}${NC}"
echo ""
sep
echo ""
echo -e "  ${BOLD}관리 명령어:${NC}"
echo "    ./setup-server.sh stop      서비스 중지"
echo "    ./setup-server.sh status    상태 확인"
echo "    ./setup-server.sh logs      로그 보기"
echo "    ./setup-server.sh restart   재시작"
echo ""
echo -e "  ${BOLD}로그 파일:${NC}"
echo "    KCP:       $LOG_DIR/kcp.log"
echo "    KCD API:   $LOG_DIR/kcd-api.log"
echo "    Dashboard: $LOG_DIR/kcd-dashboard.log"
echo ""
