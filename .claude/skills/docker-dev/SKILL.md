---
name: docker-dev
description: Docker optimization and security — Dockerfile optimization for size/speed/layers, docker-compose best practices, container security audits. Use when creating/optimizing Dockerfiles, docker-compose files, or auditing container security. Triggers: "/docker:optimize", "/docker:compose", "/docker:security", "Dockerfile", "optimize image", "reduce image size", "container security", "multi-stage build", "docker-compose".
---

# Docker Development

> Smaller images. Faster builds. Secure containers. No guesswork.

---

## Commands

| פקודה | מה עושה |
|-------|---------|
| `/docker:optimize` | ניתוח ואופטימיזציה של Dockerfile לגודל, מהירות, layer caching |
| `/docker:compose` | יצירה / שיפור docker-compose.yml עם best practices |
| `/docker:security` | ביקורת אבטחה ל-Dockerfile או container רץ |

---

## /docker:optimize — Optimization Checklist

### Base Image
```dockerfile
# ❌ Never
FROM ubuntu:latest
FROM node

# ✅ Always — pin specific version
FROM node:20.11-alpine3.19
FROM python:3.12-slim-bookworm

# ✅ Production — pin digest for reproducibility
FROM node:20.11-alpine3.19@sha256:abc123...
```

**Base image decision tree:**
```
Compiled binary (Go, Rust)?     → gcr.io/distroless/static או scratch
Need shell for debugging?        → alpine variant
Need glibc (not musl)?           → slim variant
Many OS packages?                → debian-slim
Few OS packages?                 → alpine + apk add
```

### Layer Optimization
```dockerfile
# ❌ Separate RUN = extra layers
RUN apt-get update
RUN apt-get install -y curl git
RUN apt-get clean

# ✅ Combine + clean in same layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl git && \
    rm -rf /var/lib/apt/lists/*
```

### Cache Optimization
```dockerfile
# ✅ Dependencies before source code (cache-friendly)
COPY package*.json ./
RUN npm ci --only=production

COPY . .        # source changes → only this layer rebuilds
RUN npm run build
```

### Multi-Stage Build
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime (lean)
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER appuser
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

---

## /docker:security — Security Audit

| בדיקה | חומרה | Fix |
|-------|--------|-----|
| Running as root | Critical | `RUN adduser --system appuser && USER appuser` |
| `:latest` tag | High | Pin to specific version |
| Secrets in ENV/ARG | Critical | Docker secrets / runtime env |
| No HEALTHCHECK | Medium | הוסף HEALTHCHECK |
| No resource limits | Medium | `--memory`, `--cpus` ב-compose |
| Writable root filesystem | Medium | `read_only: true` + tmpfs |
| All capabilities retained | High | `cap_drop: [ALL]` + הוסף רק מה שצריך |
| Host network mode | High | השתמש ב-bridge networks |
| Sensitive mounts (`/etc`, `docker.sock`) | Critical | הסר mount |
| Port binding `0.0.0.0` | High | תמיד `127.0.0.1:PORT:PORT` |

**Security template:**
```dockerfile
FROM node:20-alpine

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --chown=appuser:appgroup . .

RUN npm ci --only=production

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "server.js"]
```

---

## /docker:compose — Best Practices

```yaml
version: '3.9'

services:
  app:
    image: app:${VERSION:-latest}
    container_name: app-prod
    restart: unless-stopped

    # ✅ Security
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL

    # ✅ Resources
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

    # ✅ Port: ALWAYS 127.0.0.1 — never 0.0.0.0
    ports:
      - "127.0.0.1:3000:3000"

    # ✅ Health check
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

    # ✅ Watchtower integration (ל-DevOPS Kit)
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

    # ✅ Network isolation
    networks:
      - app-network

    environment:
      - NODE_ENV=production
      - PORT=3000

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    # ✅ No ports exposed — internal only
    labels:
      - "com.centurylinklabs.watchtower.enable=false"  # ❌ Never auto-update DB
    networks:
      - app-network

volumes:
  pgdata:

networks:
  app-network:
    driver: bridge
```

---

## Useful Debug Commands

```bash
# Image size analysis
docker images --format "{{.Repository}}\t{{.Size}}" | sort -k2 -h

# Layer breakdown
docker history IMAGE_NAME --no-trunc

# Container resource usage
docker stats --no-stream

# Exec into running container
docker exec -it CONTAINER_NAME sh

# Check for public ports (should return nothing)
docker ps --format "{{.Ports}}" | grep "0.0.0.0"

# Cleanup
docker system prune -f
docker volume prune -f
```

---

## DevOPS Kit — Conventions Reminder

```
✅ תמיד: 127.0.0.1:PORT:PORT (לא 0.0.0.0)
✅ Watchtower: enable=true לapp containers, enable=false לDBs
✅ Log rotation: מוגדר ב-/etc/docker/daemon.json (10MB, 3 files)
✅ Networks: bridge networks, לא host mode
✅ Restart: unless-stopped (לא always)
```
