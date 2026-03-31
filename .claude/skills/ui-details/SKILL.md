---
name: ui-details
description: Small UI details that make interfaces feel polished and professional. Apply these micro-refinements to any web UI — text rendering, shadows, animations, spacing, and more. Based on jakub.kr/writing/details-that-make-interfaces-feel-better
source: https://jakub.kr/writing/details-that-make-interfaces-feel-better
---

# UI Details — פרטים קטנים שמרגישים גדולים

> "Great interfaces rarely come from a single thing. It's usually a collection of small things that compound into a great experience."

## כיצד להשתמש

סרוק את הרשימה וזהה אילו טכניקות רלוונטיות למה שנבנה עכשיו. **אל תיישם הכל** — בחר את הרלוונטיות לקונטקסט.

---

## 1. Text Wrapping — `text-wrap: balance`

מונע מילים בודדות בסוף שורה (orphans):

```css
h1, h2, h3, p {
  text-wrap: balance; /* מחלק שורות בצורה שווה */
}
/* חלופה איטית יותר אך גמישה: */
text-wrap: pretty;
```

```tsx
// Tailwind
<h1 className="text-balance">...</h1>
<p className="text-pretty">...</p>
```

---

## 2. Concentric Border Radius — רדיוס מקונן

כשאלמנט נמצא בתוך אלמנט אחר, הרדיוסים חייבים להתאים:

```
Outer radius = Inner radius + Padding
```

```tsx
// ✅ נכון — רדיוסים מקונצנטריים
<div className="rounded-[20px] p-[8px]">       {/* outer: 20px */}
  <div className="rounded-[12px]">...</div>     {/* inner: 12px = 20 - 8 */}
</div>

// ❌ שגוי — שני אלמנטים עם rounded-lg זהה
```

**כלל מהיר:** `inner = outer - padding`. אם padding=8px ו-outer=16px, inner=8px.

---

## 3. אייקונים אנימטיביים בהקשר

כשאייקון מופיע בהקשר (hover, state change) — animate עם opacity + scale + blur:

```tsx
// Framer Motion
<motion.div
  initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
  transition={{ type: 'spring', duration: 0.3 }}
>
  <Icon />
</motion.div>
```

```css
/* CSS בלבד */
.icon {
  transition: opacity 0.2s, scale 0.2s, filter 0.2s;
}
.icon.hidden { opacity: 0; scale: 0.8; filter: blur(4px); }
```

---

## 4. טקסט חד — `-webkit-font-smoothing`

מרנדר טקסט דק וחד יותר (חשוב במיוחד על macOS):

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

```tsx
// Tailwind — הוסף ל-body או layout root
<body className="antialiased">
```

> ⚠️ החל על ה-body כדי שכל הטקסט יירש.

---

## 5. Tabular Numbers — ספרות ברוחב קבוע

מונע "קפיצות" כשמספרים מתעדכנים (timers, counters, תיבות כסף):

```css
.number {
  font-variant-numeric: tabular-nums;
}
```

```tsx
// Tailwind
<span className="tabular-nums">{count}</span>
<td className="tabular-nums text-right">{price}</td>
```

> ⚠️ בפונט Inter — `tabular-nums` משנה מעט את צורת הספרות. בדוק.

---

## 6. אנימציות שניתן להפסיק — CSS Transitions vs Keyframes

```
CSS transitions    → ניתן להפסיק ולהפנות מחדש ✅
Keyframe animation → רץ עד הסוף, לא מגיב ❌
```

```css
/* ✅ להוורים ואינטראקציה — transition */
.btn {
  transform: scale(1);
  transition: transform 0.15s ease;
}
.btn:hover { transform: scale(1.03); }

/* ✅ לאנימציות one-shot (skeleton, spinner) — keyframes */
@keyframes pulse { ... }
```

**כלל:** כל אנימציה שהמשתמש יכול להפסיק באמצע → `transition`. אנימציות שרצות לבד → `@keyframes`.

---

## 7. Stagger — כניסה מדורגת לאלמנטים

במקום להנפיש בלוק שלם — פצל לחלקים עם delay:

```css
/* CSS custom properties */
.item { animation-delay: calc(var(--stagger) * 80ms); }

/* הגדר --stagger ב-JS */
el.style.setProperty('--stagger', index);
```

```tsx
// Framer Motion — sections
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } }
};

// Framer Motion — מילים בודדות
const words = text.split(' ');
<motion.p variants={container} initial="hidden" animate="show">
  {words.map((word, i) => (
    <motion.span
      key={i}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
    >
      {word}{' '}
    </motion.span>
  ))}
</motion.p>
```

**ערכי delay מומלצים:** sections=100ms, מילים=80ms, רשימות=50ms

---

## 8. Exit Animations — עדינות ביציאה

אנימציות יציאה צריכות להיות קצרות ועדינות. האלמנט היוצא כבר לא "הגיבור":

```tsx
// ❌ exit חזק מדי
exit={{ y: "-100%", opacity: 0 }}

// ✅ exit עדין
exit={{ y: "-12px", opacity: 0, transition: { duration: 0.15 } }}
```

```
Enter: יותר תנועה, יותר זמן, spring animation
Exit:  פחות תנועה (12-16px), פחות זמן (0.1-0.2s), ease-out
```

---

## 9. יישור אופטי — לא גיאומטרי

מרכז גיאומטרי ≠ מרכז אופטי. אייקונים עם שטח ריק נראים לא ממורכזים:

```tsx
// ✅ padding שמפצה על משקל ויזואלי של אייקון
<button className="flex items-center gap-2 pl-3 pr-4">
  <Icon />
  <span>לחץ כאן</span>
</button>

// ✅ תיקון ישירות ב-SVG viewBox
// הוסף padding בצד שהאייקון נראה "צף" לקראתו
```

**בדיקה:** כפה על עצמך לטשטש את העיניים — האלמנטים נראים ממורכזים?

---

## 10. צלליות במקום גבולות

`box-shadow` שקוף עובד על כל רקע, `border` לא:

```css
/* ✅ שלוש שכבות לעומק עדין */
.card {
  box-shadow:
    0px 0px 0px 1px rgba(0, 0, 0, 0.06),
    0px 1px 2px -1px rgba(0, 0, 0, 0.06),
    0px 2px 4px 0px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow:
    0px 0px 0px 1px rgba(0, 0, 0, 0.1),
    0px 2px 4px -1px rgba(0, 0, 0, 0.1),
    0px 4px 8px 0px rgba(0, 0, 0, 0.08);
}
```

```tsx
// Tailwind — shadow מותאם
<div className="shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
```

**יתרון:** עובד על רקע גרדיאנט, תמונה, וצבע. `border: 1px solid` לא.

---

## 11. Outline על תמונות — עומק ויזואלי

מוסיף קצה עדין שגורם לתמונות "לשבת" בתוך הממשק:

```css
img, .avatar {
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px; /* בתוך הגבול, לא מחוצה לו */
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  img { outline-color: rgba(255, 255, 255, 0.1); }
}
```

```tsx
// Tailwind (custom)
<img className="outline outline-1 outline-black/10 -outline-offset-1" />
```

---

## Checklist מהיר לפני Merge

```
[ ] text-wrap: balance על כותרות?
[ ] border radius מקונצנטרי בכל הnesting?
[ ] antialiased על body?
[ ] tabular-nums על מספרים שמתעדכנים?
[ ] transitions (לא keyframes) על hover/state?
[ ] exit animations עדינות (≤0.2s, ≤16px)?
[ ] shadow במקום border על cards?
[ ] outline על תמונות ואוואטרים?
```
