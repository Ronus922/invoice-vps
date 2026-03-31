---
name: incident-commander
description: Incident response framework for production outages — severity classification, timeline reconstruction, PIR generation, stakeholder communication. Use when a service is down, degraded, or you need to run a post-mortem. Triggers: "production down", "service outage", "incident response", "post-mortem", "PIR", "what happened", "RCA".
---

# Incident Commander

מסגרת IR מלאה לניהול אירועים בproduction — מ-detection ועד PIR.

---

## Severity Classification

| Level | הגדרה | Commander | תדירות עדכון |
|-------|--------|-----------|--------------|
| **SEV1** | כשל שירות מלא, כל המשתמשים | תוך 5 דקות | כל 15 דקות |
| **SEV2** | >25% משתמשים מושפעים | תוך 30 דקות | כל 30 דקות |
| **SEV3** | <25% משתמשים, יש workaround | 2 שעות / יום עסקים הבא | Milestones בלבד |
| **SEV4** | קוסמטי, docs, dev/test | 1-2 ימי עסקים | מחזור רגיל |

---

## פרוצדורת IR — 6 שלבים

### 1. Detect & Classify (דקה 0-5)
```
□ זיהוי מקור ה-alert (Node Exporter / Sentry / Better Stack / משתמש)
□ קביעת severity לפי הטבלה
□ פתיחת war room (Slack channel: #incident-YYYY-MM-DD)
□ מינוי Incident Commander + Scribe
```

### 2. Communicate (SEV1/2 — תוך 10 דקות)
**Initial notification:**
```
Subject: [SEV{N}] {שם שירות} — {תיאור קצר}
• Start Time: {HH:MM}
• Impact: {X משתמשים / % מהתנועה}
• Status: Investigating
• Tech Lead: {שם}
• Next update: {HH:MM}
```

### 3. Mitigate (לפני root cause)
```
□ האם ניתן לrollback? → עדיף rollback על fix בלחץ
□ האם יש workaround לתקשר ללקוחות?
□ Isolate or scale? (Docker: docker-compose restart / scale)
□ תעד כל פעולה + timestamp ב-war room
```

### 4. Resolve
```
□ Deploy fix / rollback
□ Verify services healthy (docker ps, logs)
□ Confirm monitoring back to green
□ All-clear communication לכל stakeholders
```

### 5. Timeline Reconstruction
אחרי resolve, בנה timeline כרונולוגית:
```
HH:MM — {event}
HH:MM — {action taken}
HH:MM — {observation / metric change}
HH:MM — {resolution}
```

### 6. Post-Incident Review (PIR) — תוך 48 שעות

**3 RCA frameworks:**

**5 Whys:**
```
Why 1: {תסמין}
Why 2: {סיבה ישירה}
Why 3: {סיבה ביניים}
Why 4: {גורם שורשי}
Why 5: {סיסטמי root cause}
```

**Timeline RCA:** ממפה events + detection gap + response gap

**Fishbone (Ishikawa):** People / Process / Technology / Environment / External

---

## Communication Templates

**Executive Summary (SEV1):**
```
Time to Detection: {X min}
Time to Resolution: {X min}
Customer Impact: {N users / X hours}
Revenue Impact: ${estimate}
Action Required: {yes/no + what}
```

**Customer Communication:**
```
We experienced {brief description} from {HH:MM} to {HH:MM}.
During this time, {impact description}.
Workaround: {if any}
This has been resolved. We will share a full report by {date}.
```

---

## Stakeholder Cadence

| Stakeholder | SEV1 | SEV2 | SEV3 |
|-------------|------|------|------|
| Engineering Lead | Real-time | 30 min | 4 hrs |
| Executive | 15 min | 1 hr | EOD |
| Customer Support | Real-time | 30 min | 2 hrs |
| Customers | 15 min | 1 hr | Optional |

---

## Docker-specific Response

```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# View logs
docker-compose -f /var/www/PROJECT/docker-compose.yml logs --tail=100 -f

# Quick restart
cd /var/www/PROJECT && docker-compose restart

# Full recreate
docker-compose up -d --force-recreate

# Check resource usage
docker stats --no-stream
```

---

## Blameless Culture

- **Focus on systems, not people** — "the process failed", not "X failed"
- **Document decisions in real-time** — even wrong ones, with rationale
- **Share PIRs broadly** — cross-team learning
- **Update runbooks** — every incident should improve a runbook
