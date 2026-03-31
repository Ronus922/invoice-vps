---
name: observability
description: Production observability design — SLI/SLO/SLA frameworks, error budgets, multi-window burn rate alerts, Grafana dashboards, structured logging, distributed tracing. Use when designing monitoring, setting up alerts, reducing alert fatigue, or building dashboards. Triggers: "SLO", "SLI", "observability", "monitoring design", "alert fatigue", "burn rate", "dashboard", "MTTD", "MTTR".
---

# Observability Designer

עיצוב observability לproduction — SLI/SLO, alerting, dashboards, logging, tracing.

---

## SLI / SLO / SLA Framework

### הגדרות
| מונח | הגדרה | דוגמה |
|------|--------|--------|
| **SLI** (Service Level Indicator) | מדד quantitative של behavior | % requests < 200ms |
| **SLO** (Service Level Objective) | target לSLI | 99.9% requests < 200ms |
| **SLA** (Service Level Agreement) | commitment חוזי ללקוח | 99.5% uptime בחודש |
| **Error Budget** | 1 - SLO = המותר לאבד | 0.1% = 43.8 min/month |

### Golden Signals (Latency, Traffic, Errors, Saturation)
```
Latency   — p50 / p95 / p99 response time
Traffic   — requests/sec, events/sec
Errors    — 5xx rate, failed requests %
Saturation — CPU%, memory%, queue depth, disk%
```

---

## Error Budget Policy

```
Error Budget > 50%   → Features & experiments OK
Error Budget 10-50%  → Slow down risky deploys
Error Budget < 10%   → Freeze deploys, focus on reliability
Error Budget = 0%    → Incident mode, no features
```

---

## Multi-Window Burn Rate Alerts

| Window | Burn Rate | Severity | Action |
|--------|-----------|----------|--------|
| 1h | >14.4x | Critical — Page now | Immediate response |
| 6h | >6x | High — Page | Response within 1hr |
| 1d | >3x | Warning | Response within 4hrs |
| 3d | >1x | Info | Review at next sync |

```
# Formula:
burn_rate = (error_rate / (1 - SLO)) * (window / month)
# Budget consumed in 1h at 14.4x burn = 2% = significant
```

---

## Three Pillars

### Metrics (Prometheus / Grafana)
```yaml
# Docker containers — Node Exporter metrics
node_cpu_seconds_total
node_memory_MemAvailable_bytes
node_filesystem_avail_bytes
container_memory_usage_bytes
container_cpu_usage_seconds_total
```

**RED Method (microservices):**
- Rate — requests/sec
- Errors — error rate %
- Duration — latency distribution

**USE Method (infrastructure):**
- Utilization — % time resource is busy
- Saturation — work queue length
- Errors — error count

### Logs (Structured JSON)
```json
{
  "timestamp": "2026-03-28T10:00:00Z",
  "level": "error",
  "service": "api",
  "request_id": "uuid-here",
  "user_id": "123",
  "message": "Database connection failed",
  "error": "ECONNREFUSED",
  "duration_ms": 5023
}
```

**כלל:** כל log חייב לכלול `timestamp`, `level`, `service`, `request_id`.

### Traces (Distributed Tracing)
- כל request מקבל `trace_id` ייחודי
- `span` לכל operation פנימי (DB query, external API call)
- Propagate headers: `X-Trace-ID`, `X-Span-ID`

---

## Dashboard Design

**היררכיה:**
```
Overview Dashboard      → Status כל שירותים
 └─ Service Dashboard   → Golden signals לשירות ספציפי
     └─ Component View  → DB, cache, queue
         └─ Instance    → Single pod/container
```

**כלל 7±2:** מקסימום 7 panels למסך
**יחס:** 80% operational, 20% exploratory

**Grafana panels חיוניים לDocker environment:**
```
- Container uptime / restarts
- CPU + Memory per container
- Disk usage + I/O
- Network in/out
- Error rate (Nginx 5xx)
- Request latency (p95, p99)
- Active connections
```

---

## Alert Design

### כל alert חייב לענות על:
1. **מה** קורה? (שם ברור)
2. **מה ההשפעה** על המשתמש?
3. **איך לטפל?** (runbook link)
4. **מה ה-threshold** ולמה?

### מניעת Alert Fatigue
```
□ כל alert שלא מוביל לפעולה → מחק או הורד ל-Info
□ Hysteresis: alert fires at 90%, resolves at 80% (לא 90%)
□ Suppression: מניעת duplicate alerts ב-5 דקות
□ Grouping: alerts קשורים → notification אחת
□ Severity: Critical (page now) / Warning (work hours) / Info (FYI)
```

---

## Nginx + Docker Observability Stack מומלצת

```yaml
# docker-compose.yml additions
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "127.0.0.1:9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}

  node-exporter:
    image: prom/node-exporter:latest
    network_mode: host
    pid: host
    volumes:
      - /:/host:ro
    command: --path.rootfs=/host
```

---

## Success Metrics

| KPI | Target |
|-----|--------|
| MTTD (Mean Time to Detect) | < 5 min |
| MTTR (Mean Time to Resolve) | < 30 min |
| Alert Precision (% actionable) | > 80% |
| SLO Achievement Rate | > 99% |
