#!/bin/bash
# ============================================================
# 각 블록을 순서대로 터미널에 복사-붙여넣기 하세요.
# Runner는 Cloud에서 생성하면 자동으로 프로세스가 실행됩니다.
# ============================================================

# ==========================================
# [터미널 0] 인프라 — 한번만 실행
# ==========================================

# PostgreSQL + Redis 컨테이너 실행
docker run -d --name katab-pg -e POSTGRES_USER=katab -e POSTGRES_PASSWORD=katab_secret -e POSTGRES_DB=katab_orchestrator -p 5432:5432 postgres:16
docker run -d --name katab-redis -p 6379:6379 redis:7

# ==========================================
# [터미널 1] Cloud Orchestrator
# ==========================================

cd ~/Dubbi/katab-platform/cloud-orchestrator
npm install
npm run migration:run
npm run start:dev

# → http://localhost:4000 에서 서버 시작됨
# → Swagger: http://localhost:4000/docs
# → DB에 등록된 Runner가 있으면 자동으로 local-runner 프로세스 실행

# ==========================================
# [터미널 2] 계정 생성 (Cloud 서버 뜬 후)
# ==========================================

# 회원가입
curl -s -X POST http://localhost:4000/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@katab.io","password":"password123","name":"Admin","tenantName":"My QA Team"}'

# 로그인 → JWT 토큰 저장
export TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@katab.io","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "TOKEN=$TOKEN"

# Runner 생성 (platform: web | ios | android)
# 자동으로 local-runner 프로세스가 실행됨
curl -s -X POST http://localhost:4000/api/v1/account/runners \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"web-runner","platform":"web"}'

# → Cloud가 자동으로 local-runner 프로세스를 실행 (포트 자동 할당)
# → 별도의 터미널에서 runner:setup / runner:dev 실행 불필요

# ==========================================
# [터미널 3] Cloud Dashboard (React)
# ==========================================

cd ~/Dubbi/katab-platform/dashboard
npm install
npm run dev

# → http://localhost:3001 에서 Dashboard 열림 (vite.config.ts: port 3001)
# → admin@katab.io / password123 로 로그인
# → Runners 페이지에서 Runner 상태 확인
# → Devices 페이지에서 Web Recording 시작

# ==========================================
# 정리 (다 끝나면)
# ==========================================

# Ctrl+C 로 각 터미널의 서버 종료 (Runner 프로세스는 Cloud 종료시 자동 종료)
docker stop katab-pg katab-redis
docker rm katab-pg katab-redis
