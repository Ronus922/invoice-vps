# invoice - Project Status

## 📋 סטטוס נוכחי

**שלב:** התחלה
**תאריך עדכון:** 2026-03-31

## 🎯 מטרות הפרויקט

- [ ] מטרה 1
- [ ] מטרה 2
- [ ] מטרה 3

## ✅ מה הושלם

_(יתעדכן במהלך העבודה)_

## 🔄 בתהליך

_(יתעדכן במהלך העבודה)_

## 📝 הערות חשובות

_(הוסף כאן מידע שחשוב לזכור)_

## 🤖 AI Runtime

- `omx` = Codex תחת `oh-my-codex`
- `om "<task>"` = ברירת המחדל לעבודה משמעותית דרך `omx team 3:executor`
- `omd` = בדיקת תקינות עם `omx doctor --team`
- `/prompts:planner`, `/prompts:architect`, `/prompts:executor`, `/prompts:verifier` = משטחי העבודה הדיפולטיים של OMX
- `CLAUDE.md` + `AGENTS.md` של ה־KIT נשארים חוזה ההפעלה הראשי; לא מריצים `omx agents-init .` אלא אם מחליפים במכוון את תבניות ה־KIT

## 🗂️ מבנה הפרויקט

```
invoice/
├── CLAUDE.md           # הנחיות ל-AI
├── PROJECT.md          # קובץ זה
├── .claude/
│   ├── skills/         # מדריכים לפי נושא
│   └── agents/         # סוכני AI
├── src/
│   ├── app/            # Next.js App Router
│   ├── components/     # React components
│   └── lib/            # Utilities
└── ...
```

## 🔗 קישורים

- Production:
- Staging:
- Supabase:
- n8n:

# Design System Strategy: The Luminous Ledger



## 1. Overview & Creative North Star

The **Creative North Star** for this design system is **"The Digital Observatory."**



Moving away from the cluttered, grid-heavy aesthetics of traditional accounting software, this system treats financial data as a high-fidelity dashboard. It replaces rigid outlines with tonal depth and light-emitting surfaces. The experience is designed to feel like a premium, dark-mode terminal where the "Upload-to-Table" workflow is a seamless transition of states rather than a series of jarring pages. By using intentional asymmetry, breathing room (generous white space), and sophisticated layering, we transform "managing invoices" into an editorial data experience.



---



## 2. Colors & The Physics of Light



Our palette is anchored in deep oceanic blues (`#0b1326`), utilizing teals and oranges as functional glows rather than just decorative accents.



### The "No-Line" Rule

Traditional UI relies on borders to separate content. This system **prohibits 1px solid borders** for sectioning. Boundaries must be defined solely through:

* **Background Shifts:** Transitioning from `surface` to `surface-container-low`.

* **Tonal Nesting:** A `surface-container-high` card resting on a `surface-container` background.

* **Soft Glows:** Using the `primary` or `tertiary` tokens as a localized glow to define the edge of a card.



### Surface Hierarchy & Nesting

Treat the interface as a physical environment of stacked, semi-translucent glass.

* **Base:** `surface` (`#0b1326`) for the main application backdrop.

* **The Hub:** `surface-container-low` (`#131b2e`) for the primary workspace container.

* **The Data:** `surface-container-highest` (`#2d3449`) for individual invoice rows or cards.



### Glass & Gradient Rule

To achieve the "High-End Editorial" look, CTAs and floating elements should utilize **Glassmorphism**:

* **Backdrop Blur:** 12px–20px.

* **Fill:** `surface-variant` (`#2d3449`) at 60% opacity.

* **CTAs:** Use a linear gradient for primary buttons, transitioning from `primary` (`#6bd8cb`) to `on-primary-container` (`#009185`) at a 45-degree angle.



---



## 3. Typography: The Editorial Voice



We utilize a dual-font strategy to balance technical precision with professional character.



* **Display & Headline (Manrope):** Chosen for its geometric clarity and modern "tech-editorial" feel. Use `headline-lg` (2rem) for dashboard summaries to command authority.

* **Title & Body (Heebo/Inter):** For Hebrew localization, **Heebo** provides the necessary vertical metrics to match **Inter**.

* **Hierarchy as Identity:** Data visualization (numbers, amounts) should always use `title-lg` with a medium weight to ensure high readability against the dark background. Use `label-sm` in `on-surface-variant` for metadata to create a "recessed" visual feel that doesn't compete with primary data.



---



## 4. Elevation & Depth: Tonal Layering



Shadows in this system are not "black drops"; they are ambient light occlusions.



* **The Layering Principle:** Instead of a shadow, place a `surface-container-lowest` card inside a `surface-container-high` section to create a "carved out" effect.

* **Ambient Shadows:** For floating modals, use an extra-diffused shadow: `0px 24px 48px rgba(0, 0, 0, 0.4)`. The shadow color must be a tinted version of the `background` color, never pure black.

* **The "Ghost Border" Fallback:** If a separator is required (e.g., in the invoice table), use `outline-variant` (`#45464d`) at **15% opacity**. This creates a "suggestion" of a line that disappears into the depth of the UI.

* **Glow Effects:** Critical status items (e.g., "Paid" or "Urgent") should emit a subtle outer glow using their respective tokens (`primary` or `tertiary`) with a 15px blur at 20% opacity.



---



## 5. Components



### The "Upload-to-Table" Workflow

* **Upload Zone:** A `surface-container-low` area with a `dashed` ghost border (`outline-variant` at 20%). On drag-over, the area should transition to `surface-bright` with a `primary` glow.

* **The Invoice Table:** **Strictly forbid horizontal divider lines.** Instead:

* Use `8px` vertical spacing (Spacing Scale `2`) between rows.

* Apply `surface-container` to the row background.

* On hover, transition the row to `surface-container-highest` and apply a `primary` "accent bar" 2px wide on the leading edge.



### Primary Buttons

* **Styling:** 0.5rem (`lg`) corner radius.

* **Visuals:** Gradient fill (`primary` to `on-primary-container`).

* **State:** On hover, increase the `surface-tint` intensity and add a subtle `primary` shadow.



### Chips & Tags

* **Status Chips:** Use `secondary-container` for the background with `on-secondary-container` for text. No borders.

* **Interactive Chips:** Use `surface-container-highest` with a `0.25rem` (`DEFAULT`) radius.



### Input Fields

* **Structure:** No 4-sided borders. Use a "Bottom-Line Only" approach or a solid `surface-container-highest` fill with a `primary` bottom-accent on focus.

* **Typography:** Labels must use `label-md` in `on-surface-variant` to maintain a clean, professional aesthetic.



---



## 6. Do's and Don'ts



### Do

* **Do** use `20` (5rem) spacing for major section gutters to allow the data to breathe.

* **Do** use `tertiary` (Orange) sparingly for "Action Required" or "Alert" states to provide high-contrast warmth against the deep blue.

* **Do** treat the "Total Amount" column in the table with `title-lg` and `on-primary-container` coloring to make it the visual anchor.



### Don't

* **Don't** use 100% opaque white for text. Use `on-surface` or `on-surface-variant` to avoid "vibrating" text on dark backgrounds.

* **Don't** use standard Material Design elevations (1dp, 2dp). Use the Tonal Layering rules defined in Section 4.

* **Don't** use sharp corners. Use `lg` (0.5rem) for cards and `full` for buttons and chips to maintain the "Soft Tech" feel.

* **Don't** clutter the header. Use `surface-bright` with a backdrop blur to let the table content scroll underneath elegantly.