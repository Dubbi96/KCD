# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app/cloud-orchestrator
COPY cloud-orchestrator/package.json ./
COPY cloud-orchestrator/package-lock.json* ./
RUN npm install
COPY cloud-orchestrator/ ./
RUN npm run build

# ---- runner ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/cloud-orchestrator/dist ./dist
COPY --from=builder /app/cloud-orchestrator/node_modules ./node_modules
COPY --from=builder /app/cloud-orchestrator/package.json .
COPY --from=builder /app/cloud-orchestrator/tsconfig.json* .
EXPOSE 4000
CMD ["sh", "-c", "npx typeorm migration:run -d dist/database/data-source.js && node dist/main.js"]
