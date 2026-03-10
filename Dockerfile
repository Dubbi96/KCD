# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /build

# 1. katab-shared (local package dependency)
COPY katab-shared/ ./katab-shared/
WORKDIR /build/katab-shared
RUN npm install && npm run build

# 2. KCD cloud-orchestrator
WORKDIR /build/kcd
COPY KCD/cloud-orchestrator/package.json KCD/cloud-orchestrator/package-lock.json* ./
RUN sed -i 's|"file:../../katab-shared"|"file:../katab-shared"|' package.json && npm install
COPY KCD/cloud-orchestrator/ ./
RUN npm run build

# ---- runner ----
FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /build/kcd/dist ./dist
COPY --from=builder /build/kcd/node_modules ./node_modules
COPY --from=builder /build/kcd/package.json .
COPY --from=builder /build/katab-shared/dist ./node_modules/katab-shared/dist
COPY --from=builder /build/katab-shared/package.json ./node_modules/katab-shared/
EXPOSE 4000
CMD ["node", "dist/main.js"]
