---
name: self-improving
description: Memory lifecycle management — promote proven patterns from MEMORY.md to CLAUDE.md rules, extract recurring solutions into standalone skills, keep memory lean and actionable. Triggers: "promote memory", "memory full", "MEMORY.md cleanup", "extract pattern to skill", "memory review", "/si:review", "/si:promote".
---

# Self-Improving Agent

> Auto-memory captures. This skill curates.

שכבת intelligence מעל Claude Code's auto-memory: מנתח MEMORY.md, מקדם patterns מוכחים ל-CLAUDE.md, מחלץ patterns חוזרים לskills עצמאיים.

---

## Three-Tier Memory Stack

```
┌─────────────────────────────────────────────────────────┐
│                  Claude Code Memory Stack                │
├─────────────┬──────────────────┬────────────────────────┤
│  CLAUDE.md  │   Auto-Memory    │   Session Memory       │
│  כללים קבועים│   MEMORY.md     │   שיחה נוכחית          │
│  נטען תמיד  │   200 שורות ראש │   context window       │
├─────────────┴──────────────────┴────────────────────────┤
│              ↑ /si:promote        ↑ /si:review          │
│                  Self-Improving Agent                    │
│              ↓ /si:extract    ↓ /si:remember            │
└─────────────────────────────────────────────────────────┘
```

---

## Commands

| פקודה | מה עושה |
|-------|---------|
| `/si:review` | נתח MEMORY.md — מצא candidates לpromotion, entries מיושנים, הזדמנויות consolidation |
| `/si:promote` | העבר pattern מ-MEMORY.md → CLAUDE.md או `.claude/rules/` |
| `/si:extract` | הפוך pattern מוכח ל-standalone skill (SKILL.md מלא) |
| `/si:status` | Memory health dashboard — line counts, topics, recommendations |
| `/si:remember` | שמור ידנית knowledge חשוב ל-auto-memory |

---

## Promotion Lifecycle

```
1. Claude מגלה pattern → auto-memory (MEMORY.md)
2. Pattern חוזר 2-3 פעמים → /si:review מדגיש כcandidate
3. אישורך → /si:promote מעביר ל-CLAUDE.md כ-rule קבוע
4. Pattern הופך לכלל מחייב, לא רק הערה
5. Entry מ-MEMORY.md נמחק → מפנה מקום לlearnings חדשים
```

---

## מתי לpromotion

**✅ כן — promote ל-CLAUDE.md:**
- Pattern חזר 3+ פעמים בפרויקטים שונים
- הכלל חוסך זמן בכל session
- כלל עיצוב / ארכיטקטורה / security שתמיד נכון

**✅ כן — extract לskill:**
- Pattern מורכב עם 5+ steps
- שימושי גם בפרויקטים אחרים
- כולל code templates או checklist

**❌ לא — השאר ב-MEMORY.md:**
- ספציפי לפרויקט אחד
- מידע זמני (פגישה, deadline)
- עדיין לא מוכח (< 2 הופעות)

---

## /si:review — מה לחפש

```markdown
## Review Checklist

### Promotion Candidates (MEMORY.md → CLAUDE.md)
- [ ] Patterns שחזרו 3+ פעמים
- [ ] כללים שכל developer צריך לדעת בפרויקט זה
- [ ] Security/performance rules שהוזכרו מספר פעמים

### Stale Entries (למחוק)
- [ ] Deadlines שעברו
- [ ] Links שבורים
- [ ] "בעיה שנפתרה ב-X" ישנה מ-3+ חודשים

### Consolidation Opportunities
- [ ] 3+ entries על אותו נושא → ממזגים לentry אחד
- [ ] Entries סותרים → מבהירים ומ-merge

### Extraction Candidates (→ Skill)
- [ ] Workflow מורכב שחוזר
- [ ] Checklist עם 5+ פריטים שמשתמשים שוב ושוב
```

---

## /si:promote — תבנית

```markdown
## Promoted Rule (CLAUDE.md)

### {שם הכלל}
**Source:** MEMORY.md entry from {date}
**Evidence:** Appeared {N} times in: {project1}, {project2}
**Rule:**
{הכלל המנוסח כhow-to בזמן הווה}

**Why:** {הסיבה}
**How to apply:** {מתי הכלל פעיל}
```

---

## /si:extract — תבנית Skill

```markdown
---
name: {skill-name}
description: {description with triggers}
---

# {Skill Title}

{הקדמה קצרה}

## Steps
1. ...
2. ...

## Examples
...

## Anti-patterns
...
```

---

## Memory File Locations

| קובץ | מי כותב | Scope | נטען |
|------|---------|-------|------|
| `./CLAUDE.md` | אתה + `/si:promote` | Project rules | מלא, כל session |
| `~/.claude/CLAUDE.md` | אתה | Global prefs | מלא, כל session |
| `~/.claude/projects/<path>/memory/MEMORY.md` | Claude (auto) | Project learnings | 200 שורות ראשונות |
| `.claude/rules/*.md` | אתה + `/si:promote` | Scoped rules | כשקבצים תואמים פתוחים |

---

## Auto-Memory Best Practices

```
□ MEMORY.md > 150 שורות → הגיע זמן /si:review
□ אחרי 10+ sessions בפרויקט → /si:review + /si:promote
□ כשמתחילים פרויקט חדש → /si:status לראות מה רלוונטי
□ לפני סגירת שיחה ארוכה → /si:remember את הinsight החשוב
```
