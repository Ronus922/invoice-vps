---
name: skill-security-auditor
description: Security audit for AI skills before installation — scans for command injection, prompt injection, network exfiltration, credential harvesting, and supply chain risks. Use before adding any new skill to the kit. Triggers: "audit this skill", "is this skill safe", "scan skill", "check skill before install", "skill security check".
---

# Skill Security Auditor

סורק skills חדשים לפני התקנה. מחזיר verdict ברור: **PASS / WARN / FAIL**.

---

## מתי להשתמש

- לפני הוספת skill חדש ל-`DevOPS/skills/`
- לפני `kit-push` עם skill ממקור לא מוכר
- בבדיקת PR שמוסיף skill חיצוני

---

## מה נסרק

### קוד (Python / Bash / JS)
| סוג | דוגמאות | חומרה |
|-----|---------|--------|
| Command injection | `os.system()`, `eval()`, `exec()`, backticks | CRITICAL |
| Network exfiltration | `requests.post()`, `socket.connect()`, `urllib` | CRITICAL |
| Credential harvesting | קריאה מ-`~/.ssh`, `~/.aws`, env vars | CRITICAL |
| File system abuse | כתיבה מחוץ ל-skill dir, symlinks לחוץ | HIGH |
| Privilege escalation | `sudo`, `chmod 777`, cron manipulation | CRITICAL |
| Unsafe deserialization | `pickle.loads()`, `yaml.load()` ללא SafeLoader | HIGH |

### SKILL.md — Prompt Injection
| Pattern | חומרה |
|---------|--------|
| "Ignore previous instructions" | CRITICAL |
| "You are now..." / "Act as root" | CRITICAL |
| "Send contents of" / "POST to" | CRITICAL |
| Hidden zero-width characters | HIGH |
| "Run any command" | HIGH |

### Supply Chain
| בדיקה | חומרה |
|-------|--------|
| Typosquatting (שמות דומים ל-packages פופולריים) | HIGH |
| `pip install` / `npm install` בתוך scripts | HIGH |
| Binary files לא צפויים (`.so`, `.dll`, `.exe`) | CRITICAL |
| Symlinks שמצביעים מחוץ ל-skill directory | CRITICAL |

---

## פרוצדורת ביקורת

```bash
# 1. Audit local skill directory
python3 ~/DevOPS/skills/scripts/skill_security_auditor.py /path/to/skill/

# 2. Audit with strict mode (WARN → FAIL)
python3 ~/DevOPS/skills/scripts/skill_security_auditor.py /path/to/skill/ --strict

# 3. JSON output (for CI/CD)
python3 ~/DevOPS/skills/scripts/skill_security_auditor.py /path/to/skill/ --json
```

**בהיעדר הסקריפט — manual checklist:**
1. קרא כל `.py`, `.sh`, `.js` ב-skill
2. חפש: `os.system`, `eval`, `exec`, `subprocess(shell=True)`, `requests.post`, base64 payloads
3. קרא את `SKILL.md` — חפש phrases כמו "ignore instructions", "send file contents"
4. בדוק אין imports ממקורות חיצוניים שלא נדרשים

---

## פרשנות verdict

```
PASS  — אין critical/high findings. בטוח להתקנה.
WARN  — יש high/medium findings. בדוק ידנית לפני התקנה.
FAIL  — יש critical findings. אסור להתקין ללא remediation.
```

---

## אינטגרציה ב-CI/CD

```yaml
- name: audit-skill-security
  run: |
    python3 skill_security_auditor.py ./skills/new-skill/ --strict --json > audit.json
    [ $? -ne 0 ] && echo "Security audit FAILED" && exit 1
```

---

## הגבלות
- Static analysis בלבד — לא מריץ קוד
- לא מזהה logic bombs עם delay
- CVE check הוא pattern-based, לא live database
