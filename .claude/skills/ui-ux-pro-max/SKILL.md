---
name: ui-ux-pro-max
description: Advanced UI/UX design intelligence for complex interfaces. Auto-activate when high-impact UI/UX decisions are needed; manual trigger via /ui-ux-pro-max is always supported.
source: /home/ubuntu/DevOPS/vendor/ui-ux-pro-max/upstream-src/SKILL.upstream.md
---

# UI/UX Pro Max - KIT Wrapper

Skill זה מוסיף שכבת UI/UX מתקדמת למשימות מורכבות, תוך שמירה על כללי KIT.

## הפעלה

### Auto (לפי החלטת ה-AI)
הפעל Skill זה אוטומטית כאשר המשימה כוללת אחד או יותר:
- Redesign משמעותי של עמוד/מערכת
- בניית Design System או שדרוג שפה עיצובית
- Flow מורכב מרובה מסכים (onboarding, checkout, dashboards)
- דרישה מפורשת ל-UI premium / conversion-focused / polished
- ביקורת UI/UX עם פערי שימושיות/נגישות קריטיים

### Manual
- הפעלה ידנית תמיד זמינה עם: `/ui-ux-pro-max`

## קדימויות מחייבות (לא ניתנות לעקיפה)
1. `master` rules קודמים לכל המלצה של Skill זה
2. RTL First ו-Mobile First תמיד נשמרים
3. TypeScript strict: אין `any`, אין `console.log`
4. Gap over margin, padding מינימלי, touch targets 44x44
5. אין שבירה של design tokens או כללי brand קיימים בפרויקט

## איך לעבוד עם Skill זה
1. הגדירו מטרת מסך/פיצ'ר + קהל יעד.
2. בחרו כיוון עיצובי ברור (לא ביניים גנרי).
3. הגדירו היררכיית מידע ו-interaction states.
4. ודאו נגישות: contrast, focus, keyboard, reduced motion.
5. בצעו התאמה מלאה ל-RTL + responsive breakpoints.

## חלוקת אחריות מול Skills קיימים
- `/design`: source of truth לכללי spacing/typography/tokens
- `/frontend-design`: כיוון קריאייטיבי וביצוע ויזואלי distinct
- `/uiux-review`: ביקורת ויזואלית על תוצאה קיימת
- `/ui-ux-pro-max`: החלטות עיצוב מורכבות, tradeoffs וארכיטקטורת UX

## מקורות Vendored
- Metadata: `/home/ubuntu/DevOPS/vendor/ui-ux-pro-max/PINNED_SOURCE.json`
- Upstream snapshot: `/home/ubuntu/DevOPS/vendor/ui-ux-pro-max/upstream-src/`

אם יש סתירה מול כללי KIT, כללי KIT מנצחים.
