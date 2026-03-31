---
name: engineering-pro
description: Engineering Pro — Master skill that loads all 7 engineering excellence skills: skill security auditing, incident response, observability/SLO design, self-improving memory, spec-driven development, dependency auditing, and Docker optimization. Use for engineering quality, reliability, and security tasks. Triggers: "engineering pro", "engineering quality", "production reliability", "security audit", "incident", "observability", "spec", "dependencies", "docker".
---

# Engineering Pro — Master Skill

> שכבת Engineering Excellence מעל הKit הרגיל.
> 7 skills מתוך `alirezarezvani/claude-skills` — מותאמים לסביבת DevOPS Kit.

---

## Skill Routing

```
🔐 Security?        → /skill-security-auditor  (סקירה לפני התקנת skill חיצוני)
🚨 Incident/Outage? → /incident-commander       (IR framework, PIR, RCA)
📊 Monitoring/SLO?  → /observability            (SLI/SLO, alerts, dashboards)
🧠 Memory cleanup?  → /self-improving           (MEMORY.md → CLAUDE.md rules)
📋 New Feature?     → /spec-driven              (Spec-first, FR-N, AC Given/When/Then)
📦 Dependencies?    → /dependency-auditor       (CVE, licenses, supply chain)
🐳 Docker?          → /docker-dev               (optimize, compose, security)
```

---

## Dual-Mode Integration (Ruflo)

| Task | Platform | Command |
|------|----------|---------|
| Spec writing | 🔵 Claude Code | `/spec-driven` |
| Implementation | 🟢 Codex | `/spec-driven` → implement ACs |
| Security audit | 🔵 Claude Code | `/skill-security-auditor` |
| Docker setup | 🟢 Codex | `/docker-dev` → generate files |
| Incident response | 🔵 Claude Code | `/incident-commander` |
| SLO design | 🔵 Claude Code | `/observability` |
| Memory promote | 🔵 Claude Code | `/self-improving` |
| Dep audit | 🔵 Claude Code | `/dependency-auditor` |

---

## Skill 1 — /skill-security-auditor

סורק skills חדשים לפני התקנה — command injection, prompt injection, exfiltration, supply chain.

**Verdict:** PASS / WARN / FAIL

**Triggers:** "audit skill", "is this skill safe", "scan skill before install"

**Use before:** כל הוספה של skill חיצוני ל-`DevOPS/skills/`

---

## Skill 2 — /incident-commander

Framework IR מלא — Severity 1-4, timeline, PIR, 3 RCA methods, communication templates.

**Triggers:** "production down", "service outage", "post-mortem", "PIR", "RCA"

**Steps:** Detect → Classify → Communicate → Mitigate → Resolve → PIR (within 48h)

---

## Skill 3 — /observability

עיצוב observability לproduction — SLI/SLO/SLA, error budgets, multi-window burn rate alerts, Grafana dashboards.

**Triggers:** "SLO", "SLI", "alert fatigue", "burn rate", "MTTD", "MTTR"

**Outputs:** SLO framework, Prometheus/Grafana config, alert rules, dashboard JSON

---

## Skill 4 — /self-improving

Memory lifecycle — מקדם patterns מ-MEMORY.md ל-CLAUDE.md, מחלץ patterns חוזרים לskills.

**Commands:** `/si:review` → `/si:promote` → `/si:extract` → `/si:status`

**When:** MEMORY.md > 150 שורות, patterns חוזרים 3+ פעמים

---

## Skill 5 — /spec-driven

No code without approved spec — 9 sections מנדטוריים, RFC 2119, Given/When/Then ACs, TDD integration.

**Triggers:** "write spec first", "define acceptance criteria", "feature requirements"

**Output:** Approved spec → failing test stubs → implementation → self-review

---

## Skill 6 — /dependency-auditor

CVE scanning, license compliance, supply chain security, upgrade path planning — 8 ecosystems.

**Triggers:** "audit dependencies", "CVE", "license compliance", "supply chain"

**Frequency:** Security daily, licenses weekly, upgrade planning monthly

---

## Skill 7 — /docker-dev

Dockerfile optimization, docker-compose best practices, container security audit.

**Commands:** `/docker:optimize` / `/docker:compose` / `/docker:security`

**Triggers:** "Dockerfile", "optimize image", "container security", "multi-stage build"

---

## Quick Decision Tree

```
New skill from external source?
  └─ /skill-security-auditor first → PASS → install

Production alert / service down?
  └─ /incident-commander → classify severity → IR protocol

Setting up monitoring?
  └─ /observability → SLO framework → alert rules → dashboards

Starting new feature?
  └─ /spec-driven → write spec → get approval → generate tests → implement

Memory.md getting large?
  └─ /self-improving → /si:review → /si:promote → /si:extract

Adding new package / npm install?
  └─ /dependency-auditor → CVE check → license check → approve

Writing Dockerfile / docker-compose?
  └─ /docker-dev → /docker:optimize or /docker:security
```

---

## Engineering Excellence Principles

1. **Security First** — כל skill חיצוני נסרק לפני הפצה ל-16+ שרתים
2. **Spec Before Code** — לא מתחילים לממש בלי spec מאושרת
3. **Observability by Default** — כל שירות חדש מקבל SLO + alerts מהיום הראשון
4. **Blameless Culture** — post-mortems מתמקדים בsystems, לא ב-people
5. **Memory Hygiene** — MEMORY.md נשאר lean, patterns מוכחים הופכים לכללים
6. **Secure Containers** — תמיד `127.0.0.1`, non-root user, resource limits
7. **Dependencies Audited** — אין package חדש ללא CVE + license check

---

## Related Skills

| Skill | Connection |
|-------|-----------|
| `/security` | OWASP, RLS, auth — application security |
| `/monitoring` | Sentry, Better Stack — integration layer |
| `/ruflo` | Dual-mode orchestration |
| `/devtools` | Git, bash, system utilities |
