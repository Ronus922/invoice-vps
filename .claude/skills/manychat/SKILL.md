---
name: manychat
description: ManyChat Infrastructure Template - Server-side orchestration, WhatsApp/IG chatbot, state machine, batching, CRM integration, handoff. Use when building or deploying ManyChat-powered conversational flows.
---

# ManyChat Infrastructure Skill

> **כלל ברזל:** השרת הוא מקור האמת ללוגיקה. ManyChat הוא שכבת ערוץ, אוטומציות ושליחה בלבד.

---

## Architecture Overview

```
User (WhatsApp/IG) → ManyChat → External Request → Server Webhook
Server processes → writes AI Response field → triggers ManyChat Flow → User gets reply
```

**Pattern:** השרת מייצר תשובה, ManyChat מבצע את השליחה בפועל.

---

## 1. Core Modules

### Config — `src/lib/manychat/config.ts`

**הקובץ הראשון שמחליפים בהטמעה חדשה.**

מכיל:
- Custom field IDs
- Tag IDs
- Flow IDs
- Company metadata
- System prompts / behavior defaults
- Hardcoded texts

### API Client — `src/lib/manychat/client.ts`

קריאות ל-ManyChat API:
- `findSubscriberBySystemField`
- `getSubscriberInfo` / `createSubscriber` / `updateSubscriber`
- `setSubscriberCustomFields` (auto-chunks to 20 max)
- `addSubscriberTag` / `removeSubscriberTag` (error-resilient)
- `sendFlowToSubscriber`

**Constraints already solved:**
| בעיה | פתרון |
|------|-------|
| max 20 fields per `setCustomFields` | Auto-chunking |
| `null`/empty field validation errors | Filter before send |
| `removeTag` fails if tag not on subscriber | Swallow expected errors |

### Service (Orchestration) — `src/lib/manychat/service.ts`

שכבת orchestration ראשית:
1. Parse payload
2. Resolve/create lead
3. Upsert conversation
4. Save messages + files
5. Message batching (wait for quiet window)
6. State machine processing
7. Summary + scoring
8. Sync back to ManyChat (fields, tags, flows)
9. Handoff to agent if needed

### State Machine — `src/lib/manychat/state-machine.ts`

**זה החלק היחיד שהוא business-specific — מחליפים לכל תסריט חדש.**

Reusable mechanisms:
- Recovery from invalid states
- Small talk handling
- Conversational steering (gentle return to script)
- Human handoff detection
- Option matching
- Address parsing

### Summary / Score — `src/lib/manychat/summary.ts`

- `AI Summary` + `AI Score`
- Heuristic fallback + Claude if available

---

## 2. Public Endpoints

### Incoming Turn Webhook

```
POST /api/webhooks/manychat/turn
```

ManyChat calls this via External Request on every incoming message.

Flow:
1. Receive payload (supports multiple ManyChat formats)
2. Find or create lead
3. Save message as INBOUND
4. Batch wait (2.5s quiet window, max 6 messages)
5. State machine decides response
6. Write to `AI Response` custom field
7. Trigger ManyChat flow that sends `AI Response`
8. Save OUTBOUND record

Health check: `GET /api/webhooks/manychat/turn`

### Outbound Start (CRM-initiated)

```
POST /api/integrations/manychat/outbound-start
```

For proactive outreach from CRM:
- Receives `leadId`
- Resolves/creates subscriber
- Syncs basic fields
- Triggers opening flow

---

## 3. Message Batching

```
BATCH_WAIT_MS = 2500
MAX_BATCH_MESSAGES = 6
```

- Don't reply to every partial message immediately
- Wait if user sends multiple bubbles
- Creates more human-like conversation feel

---

## 4. Natural Conversation Layer

Above the script sits a conversational layer:
- Small talk (`היי`, `מה קורה`) doesn't count as failure
- Side questions get short answer, then gentle return to script
- Handoff only when truly needed, not because user spoke naturally

---

## 5. Human Handoff

When triggered:
- Conversation status → `WAITING_FOR_AGENT`
- Handoff response written to `AI Response`
- Handoff tag added
- Help user notified via dedicated flow
- Requires: `MC_HELP_USER_ID`, handoff flow, handoff tag

---

## 6. Database Schema

### Tables

#### `lead_conversations`
Key fields: `leadId`, `manychatSubscriberId`, `channel`, `status`, `currentState`, `score`, `summary`, `lastAiResponse`, `collectedData`, `hasDocument`, `reminderCount`, `invalidReplyCount`, `source`, `utm*`

#### `lead_conversation_messages`
Per-message: `direction`, `messageType`, `content`, `rawPayload`, `responseBatchId`, `processingStartedAt`, `processedAt`

#### `lead_conversation_files`
Attachments: `manychatFileId`, `originalFilename`, `mimeType`, `remoteUrl`, `storagePath`, `fileSizeBytes`

---

## 7. CRM Integration

### API enrichment
Lead DTO includes chatbot snapshot:
- `chatStatus`, `chatScore`, `chatSummary`, `chatLink`
- `hasDocument`, `documentCount`
- Business-specific collected fields

### UI components
- Chat status badges
- Score display
- Summary
- ManyChat link
- Document indicators
- Files tab per lead

---

## 8. Payload Parsing Compatibility

Supports ManyChat field variations:
- `subscriberId` / `subscriber_id` / `id` / `subscriber.id`
- `custom_fields` / `customFields` / `fields` / `currentFields`
- `live_chat_url`, `whatsapp_phone`, `last_input_text`

---

## 9. Environment Variables

```env
MANYCHAT_API_KEY=          # ManyChat API token
MANYCHAT_WEBHOOK_SECRET=   # Optional webhook auth
MANYCHAT_BASE_URL=         # API base URL
MC_HELP_USER_ID=           # Subscriber ID for agent notifications
```

---

## 10. New Project Setup Checklist

### Always Replace
- [ ] Field IDs, tag IDs, flow IDs in `config.ts`
- [ ] Company metadata
- [ ] State machine / script logic
- [ ] Summary/scoring rubric
- [ ] Help user ID

### Usually Keep
- [ ] Webhook endpoint shape
- [ ] Outbound-start endpoint
- [ ] DB tables
- [ ] Message batching
- [ ] ManyChat client
- [ ] CRM snapshot plumbing
- [ ] File persistence
- [ ] Phone normalization
- [ ] Conversational recovery layer

### ManyChat Side Setup
- [ ] External Request → `/api/webhooks/manychat/turn`
- [ ] Custom field: `AI Response`
- [ ] Flow that sends `AI Response` content to user
- [ ] Handoff flow for agent notification

### Deploy
```bash
npx prisma migrate dev
npx prisma generate
npx tsc --noEmit
npm run build
# Smoke test with real ManyChat message
```

---

## 11. Testing

```bash
npm run test:chatbot          # All chatbot tests
npx tsc --noEmit              # Type check
npm run build                 # Full build
```

Test files:
- `tests/manychat/normalizePhone.test.ts`
- `tests/manychat/state-machine.test.ts`
- `tests/manychat/chatbot-snapshot.test.ts`

---

## 12. File Reference

```
src/lib/manychat/
├── config.ts          # IDs, metadata, prompts — REPLACE PER PROJECT
├── client.ts          # ManyChat API calls — REUSE
├── service.ts         # Orchestration — REUSE
├── state-machine.ts   # Script logic — REPLACE PER PROJECT
├── summary.ts         # AI Summary/Score — ADJUST
└── types.ts           # TypeScript types — REUSE

src/lib/crm/chatbot.ts              # CRM snapshot DTO
src/lib/normalizePhone.ts           # Phone normalization
src/app/api/webhooks/manychat/turn/ # Inbound webhook
src/app/api/integrations/manychat/  # Outbound start
src/app/api/crm-leads/[id]/files/   # Lead files API
```

---

## 13. Operational Notes

- Build requires extra heap: `NODE_OPTIONS=--max-old-space-size=6144`
- Production runs via Docker Compose
- After webhook/state-machine changes: `docker compose up -d --build`
