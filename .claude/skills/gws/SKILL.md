---
name: gws
description: Google Workspace orchestration via MCP tools — Gmail, Google Calendar, Drive, Docs, Sheets. Pre-built recipes for executive assistant, scheduling, project management, and IT admin workflows. Use when working with Gmail, Google Calendar, scheduling meetings, managing emails, or coordinating GWS tasks. Triggers: "gmail", "google calendar", "calendar event", "send email", "schedule meeting", "google workspace", "GWS", "check inbox", "create event".
---

# Google Workspace (GWS)

> Gmail + Google Calendar + Drive דרך MCP — workflows מוכנים.

---

## Available MCP Tools

### Gmail
| Tool | פעולה |
|------|-------|
| `gmail_get_profile` | פרטי המשתמש + inbox stats |
| `gmail_search_messages` | חיפוש emails לפי query |
| `gmail_read_message` | קריאת email ספציפי |
| `gmail_read_thread` | קריאת thread שלם |
| `gmail_list_labels` | כל הlabels |
| `gmail_list_drafts` | drafts קיימים |
| `gmail_create_draft` | יצירת draft חדש |

### Google Calendar
| Tool | פעולה |
|------|-------|
| `gcal_list_calendars` | כל הcalendars |
| `gcal_list_events` | events בטווח תאריכים |
| `gcal_get_event` | event ספציפי |
| `gcal_create_event` | יצירת event חדש |
| `gcal_update_event` | עדכון event |
| `gcal_delete_event` | מחיקת event |
| `gcal_respond_to_event` | accept/decline invitation |
| `gcal_find_meeting_times` | זמנים פנויים משותפים |
| `gcal_find_my_free_time` | slots פנויים |

---

## Recipes

### Recipe 1: Executive Assistant — Morning Brief
```
1. gmail_get_profile → inbox count
2. gmail_search_messages(query="is:unread") → unread emails
3. gcal_list_events(today) → today's meetings
4. סינתז: "יש לך X emails חדשים + Y פגישות היום"
```

### Recipe 2: Schedule a Meeting
```
1. gcal_find_meeting_times(attendees, duration, range) → available slots
2. הצג 3 אפשרויות למשתמש
3. gcal_create_event(chosen_slot, attendees, description)
4. gmail_create_draft(invite_email) אם נדרש
```

### Recipe 3: Email Triage
```
1. gmail_search_messages(query="is:unread is:important")
2. לכל email: gmail_read_thread → סיכום
3. קטגוריזציה: requires-action / FYI / can-archive
4. יצירת drafts לתגובות דחופות
```

### Recipe 4: Project Manager Weekly
```
1. gcal_list_events(this_week) → meetings + deadlines
2. gmail_search_messages(query="from:team label:project") → updates
3. סיכום: מה קרה, מה מגיע, מה תקוע
```

---

## Prompt Patterns

### חיפוש Gmail מדויק
```python
# Gmail search syntax
query = "from:boss@company.com subject:budget is:unread after:2026/03/01"
query = "has:attachment larger:5M label:invoice"
query = "to:me cc:cto is:starred"
```

### יצירת Calendar Event
```json
{
  "summary": "Sprint Planning",
  "description": "Q2 sprint kickoff",
  "start": "2026-04-01T10:00:00+03:00",
  "end": "2026-04-01T11:00:00+03:00",
  "attendees": ["dev@company.com", "pm@company.com"],
  "location": "Zoom / Conference Room A",
  "reminders": { "useDefault": false, "overrides": [{"method": "popup", "minutes": 15}] }
}
```

---

## Common Workflows (Hebrew)

### בדיקת יומן היום
```
בדוק מה יש לי היום ביומן
→ gcal_list_events(timeMin=today_start, timeMax=today_end)
```

### שליחת Draft
```
תכתוב טיוטה ל{name} בנושא {topic}
→ gmail_create_draft(to, subject, body)
```

### מציאת זמן פגישה
```
מצא זמן לפגישה של שעה עם {emails} השבוע
→ gcal_find_meeting_times(attendees=[...], duration=60, timeRange=this_week)
```

---

## Best Practices

- **Timezone**: תמיד `Asia/Jerusalem` (UTC+3 קיץ, UTC+2 חורף)
- **Date format**: ISO 8601 עם timezone offset: `2026-04-01T10:00:00+03:00`
- **Search scope**: Gmail search syntax זהה לweb interface
- **Rate limits**: Gmail API — 10,000 units/day, Calendar — 1,000,000 requests/day
- **Draft vs Send**: תמיד draft ראשון — המשתמש מאשר לפני שליחה

---

## Anti-Patterns

- **לא לשלוח email בלי אישור** — תמיד draft → approve → send
- **לא לבטל meetings לאחרים** — gcal_respond_to_event בלבד, לא delete
- **Timezone bugs** — לא להשתמש ב-UTC גרד, תמיד timezone מפורש
- **Privacy** — לא לקרוא threads לא רלוונטיים לבקשה

---

## Related Skills
- `/workflows` — n8n automations עם GWS webhooks
- `/utilities` — CRM notifications + push
- `/monitoring` — alerts שנשלחות ל-Gmail
