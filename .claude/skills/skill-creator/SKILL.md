---
name: skill-creator
description: Meta-skill for creating, evaluating, and improving Claude Code skills. Builds new SKILL.md files with proper format, runs benchmark evals, grades quality, and iterates with improvement loop. Use when creating a new skill from scratch, improving an existing skill, or benchmarking skill quality. Triggers: "create new skill", "build skill", "improve skill", "eval skill", "benchmark skill", "skill quality".
---

# Skill Creator

> מטה-skill ליצירת, הערכת, ושיפור skills לקיט.

---

## מתי להשתמש

- יצירת skill חדש מאפס
- שיפור skill קיים שלא מניב תוצאות טובות
- benchmark של איכות skill לפני הפצה
- חילוץ pattern חוזר לskill עצמאי (בשיתוף עם `/self-improving`)

---

## Skill Format הרשמי

```yaml
---
name: skill-name              # lowercase, hyphens, max 64 chars
description: "..."            # מה + מתי לכתוב, max 1024 chars
                              # ⚠ חיוני — Claude מחליט מזה אם לטעון
license: Apache-2.0           # אופציונלי
compatibility: "node 18+"     # אופציונלי
metadata:
  version: "1.0.0"
allowed-tools: Bash Read      # אופציונלי — כלים שהskill דורש
---

# Instructions here
```

**Progressive Disclosure (חיוני לביצועים):**
```
Level 1 — Metadata (~100 tokens):  name + description → נטענים תמיד
Level 2 — Instructions (<5000t):   גוף ה-SKILL.md → נטען כשהskill פעיל
Level 3 — On Demand:               scripts/, references/, assets/ → לפי צורך
```

---

## 5-Phase Creation Workflow

### Phase 1: Define
```
□ מה הskill עושה? (1 משפט ברור)
□ מה ה-trigger phrases? (5-8 לפחות)
□ מה OUTPUT ה-expected?
□ מה לא בתחום הskill? (out-of-scope)
□ האם skill קיים כבר מכסה זאת?
```

### Phase 2: Structure
```
SKILL.md:
├── name: (frontmatter)
├── description: (frontmatter — הכי חשוב!)
├── # Title
├── ## מתי להשתמש
├── ## Core Workflow / Steps
├── ## Examples / Templates
├── ## Anti-patterns / Common Pitfalls
└── ## Related Skills

scripts/ (אופציונלי):
└── כלי CLI שהskill קורא להם

references/ (אופציונלי):
└── REFERENCE.md — knowledge base מפורטת
```

### Phase 3: Write Description (הכי קריטי)
```
Description template:
"{מה הskill עושה} using {גישה/שיטה}.
Use when: (1) {use case 1}, (2) {use case 2}, (3) {use case 3}.
Triggers: '{phrase 1}', '{phrase 2}', '{phrase 3}'."

✅ דוגמה טובה:
"Guide for building MCP servers that connect external APIs to Claude.
Use when: (1) integrating REST APIs, (2) building DevOPS tools, (3) connecting n8n workflows.
Triggers: 'build MCP', 'MCP server', 'connect API to Claude'."

❌ דוגמה גרועה:
"Helps with MCP stuff"
```

### Phase 4: Evaluate (Eval Loop)

**4 מדדי איכות:**

| מדד | שאלה | ציון |
|-----|------|------|
| **Trigger Accuracy** | האם Claude מפעיל הskill בזמן הנכון? | 0-10 |
| **Output Quality** | האם ה-output מועיל ומדויק? | 0-10 |
| **Completeness** | האם מכסה את כל cases הנדרשים? | 0-10 |
| **Efficiency** | האם לא מבזבז tokens על חומר לא רלוונטי? | 0-10 |

**Test Cases מינימום:**
```
□ Happy path — use case עיקרי פועל
□ Edge case — input לא סטנדרטי
□ Negative — trigger phrase שלא אמורה להפעיל
□ Complex — שילוב עם skill אחר
```

**Eval prompt template:**
```
Given this skill: [SKILL.md content]
Task: [task description]
Expected: [expected output]

Grade (0-10) on:
- Did the skill trigger correctly?
- Was the output accurate and complete?
- Were there any hallucinations?
- Was it concise without unnecessary content?
```

### Phase 5: Iterate

```
Score < 7 → iterate:
  - Description לא ברורה → שפר trigger phrases
  - Output לא מלא → הוסף sections חסרים
  - Output ארוך מדי → חלוק ל-progressive disclosure
  - Edge cases חסרים → הוסף examples

Score 7-8 → שפר description + edge cases
Score 9-10 → מוכן להפצה
```

---

## Checklist לפני kit-push

```
□ name: unique ולא חופף לskill קיים
□ description: מכיל trigger phrases ברורים
□ SKILL.md: מתחת ל-5000 tokens
□ Progressive disclosure: חומר כבד ב-references/
□ /skill-security-auditor: PASS (אם skill ממקור חיצוני)
□ Related skills: צוינו בסוף
□ Anti-patterns: צוינו
□ Tested: לפחות 3 test cases עברו
```

---

## Eval Schemas (JSON)

**evals.json:**
```json
{
  "skill": "skill-name",
  "version": "1.0.0",
  "cases": [
    {
      "id": "happy-path-01",
      "input": "user request",
      "expected_contains": ["key phrase", "expected output"],
      "should_trigger": true
    }
  ]
}
```

**benchmark.json:**
```json
{
  "skill": "skill-name",
  "runs": 10,
  "pass_threshold": 0.85,
  "grading_criteria": {
    "trigger_accuracy": 0.3,
    "output_quality": 0.4,
    "completeness": 0.3
  }
}
```

---

## שיפור Skill קיים

```
1. הרץ eval על skill הנוכחי → קבל baseline score
2. זהה weakness: trigger? output? completeness?
3. ערוך SKILL.md
4. הרץ eval שוב → השווה score
5. חזור עד score >= 9
6. kit-push
```

---

## Related Skills
- `/self-improving` — קידום patterns מ-MEMORY.md לskills
- `/skill-security-auditor` — סריקת skills חיצוניים לפני הטמעה
- `/spec-driven` — spec-first approach לפני כתיבת skill מורכב
