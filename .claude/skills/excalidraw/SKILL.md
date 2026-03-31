---
name: excalidraw
description: Generate publication-ready architecture diagrams from natural language descriptions using Excalidraw JSON format. Visual structure maps to conceptual structure with self-validation. Use when creating architecture diagrams, system design visuals, sequence diagrams, flow charts, or any technical diagram. Triggers: "create diagram", "architecture diagram", "draw system", "excalidraw", "visualize architecture", "sequence diagram", "flow diagram", "system design diagram".
---

# Excalidraw Diagram Generator

> טקסט → diagram ארכיטקטורי מוכן לפרסום.

---

## מתי להשתמש

- ציור ארכיטקטורת system design
- sequence diagram של flow
- deployment diagram (Docker, Nginx, services)
- ERD / data model visual
- כל תיעוד ויזואלי טכני

---

## Excalidraw JSON Structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {
      "id": "unique-id",
      "type": "rectangle|ellipse|arrow|text|diamond",
      "x": 100, "y": 100,
      "width": 160, "height": 60,
      "angle": 0,
      "strokeColor": "#1e1e2e",
      "backgroundColor": "#cdd6f4",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "roughness": 1,
      "opacity": 100,
      "text": "Service Name",
      "fontSize": 16,
      "fontFamily": 1,
      "textAlign": "center"
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  }
}
```

---

## Element Types

| Type | שימוש |
|------|-------|
| `rectangle` | Service, component, container |
| `ellipse` | Database, storage, external actor |
| `diamond` | Decision point |
| `arrow` | Data flow, dependency, connection |
| `text` | Labels, annotations |
| `line` | Group boundaries |

---

## Color Palette (DevOPS Kit)

```
Services:      #cdd6f4 fill, #1e1e2e stroke
Databases:     #a6e3a1 fill, #40a02b stroke
External:      #f5c2e7 fill, #ea76cb stroke
Infrastructure:#fab387 fill, #fe640b stroke
Boundaries:    transparent fill, #6c7086 stroke dashed
Arrows:        #1e1e2e stroke, endArrowhead: "arrow"
```

---

## Common Patterns

### Server Architecture (DevOPS)
```
Layout: Internet → Nginx → Services → DB
X positions: Internet=100, Nginx=350, Services=600, DB=850
Y spacing: 80px between parallel services
Group boundaries: dashed rectangle around groups
```

### Sequence Diagram
```
Elements: actors (top row, ellipse), vertical lifelines (line), messages (arrow with label)
Y increases downward per step: +60px per message
Return arrows: dashed line
```

### Microservices
```
Central API Gateway → child services fan out
Use arrows with labels for protocols (REST, gRPC, WebSocket)
Group by domain with dashed boundary rectangles
```

---

## Generation Workflow

### Step 1: Parse Request
```
קלט: "ארכיטקטורה של מערכת multi-tenant עם n8n, Nginx, Postgres"

זהה:
□ הcomponents (n8n, Nginx, Postgres)
□ החיבורים (מה מדבר עם מה)
□ גבולות (external / internal)
□ כיוון flow (LTR / top-down)
```

### Step 2: Layout Planning
```
Grid: 200px per column, 80px per row
Plan on paper first:
  Col 1 (x=100): External (Internet, User)
  Col 2 (x=350): Edge (Nginx, Load Balancer)
  Col 3 (x=600): Services
  Col 4 (x=850): Data layer (DB, Cache, Queue)
```

### Step 3: Generate JSON
```
1. יצור כל element עם id ייחודי
2. חשב מיקומים לפי layout grid
3. הוסף arrows עם startBinding/endBinding
4. הוסף text labels
5. הגדר groupIds לelements קשורים
```

### Step 4: Validate (אופציונלי)
```bash
# אם Playwright זמין — render ל-PNG לבדיקה
node scripts/render-excalidraw.js diagram.json output.png
```

---

## Example: DevOPS Architecture

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {
      "id": "internet",
      "type": "ellipse",
      "x": 50, "y": 120,
      "width": 120, "height": 60,
      "backgroundColor": "#f5c2e7",
      "strokeColor": "#ea76cb",
      "text": "Internet"
    },
    {
      "id": "nginx",
      "type": "rectangle",
      "x": 250, "y": 110,
      "width": 140, "height": 80,
      "backgroundColor": "#fab387",
      "strokeColor": "#fe640b",
      "text": "Nginx :443"
    },
    {
      "id": "arrow-1",
      "type": "arrow",
      "x": 170, "y": 150,
      "width": 80, "height": 0,
      "startBinding": { "elementId": "internet" },
      "endBinding": { "elementId": "nginx" },
      "label": "HTTPS"
    }
  ]
}
```

---

## Output Formats

```bash
# שמור JSON
echo '{...}' > diagram.excalidraw

# פתח ב-browser
open https://excalidraw.com  # drag & drop את הJSON

# Export ל-PNG/SVG מExcalidraw UI
File → Export Image → PNG/SVG
```

---

## Anti-Patterns

- **Uniform grid** — אל תשים הכל בשורה ישרה. Layout = conceptual hierarchy
- **Missing labels** — כל arrow חייב label (protocol, data type, direction)
- **Too dense** — מעל 15 elements → split לsub-diagrams
- **Wrong shapes** — ellipse לDBs, rectangle לservices, diamond להחלטות
- **No boundaries** — services without domain grouping = chaos

---

## Related Skills
- `/doc-coauthoring` — כולל diagrams בspecs ו-ADRs
- `/architecture` — ארכיטקטורת מערכות
- `/deployment-guide` — diagrams בguides
