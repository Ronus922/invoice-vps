---
name: cost-optimization
description: Claude API & Infrastructure Cost Optimization - model selection, token budgeting, caching strategies, batch processing.
version: 1.0.0
---

# COST-OPTIMIZATION.md — עלויות Claude API ותשתית

> בחירת מודל נכון, token budgeting, caching, batch processing — לפני שהחשבון מפתיע

---

## Table of Contents

1. [בחירת מודל Claude לפי משימה](#1-בחירת-מודל-claude-לפי-משימה)
2. [Token Budgeting](#2-token-budgeting)
3. [Prompt Caching](#3-prompt-caching)
4. [Application-level Caching](#4-application-level-caching)
5. [Streaming — UX ללא עלות נוספת](#5-streaming--ux-ללא-עלות-נוספת)
6. [Batch Processing עם n8n](#6-batch-processing-עם-n8n)
7. [Cost Monitoring](#7-cost-monitoring)
8. [Infrastructure Cost](#8-infrastructure-cost)

---

## 1. בחירת מודל Claude לפי משימה

### מחירון (בערך, לבדוק ב-anthropic.com)

| מודל | Input | Output | מתאים ל |
|------|-------|--------|---------|
| **Claude Haiku 3.5** | זול מאוד | זול מאוד | Classification, extraction, simple Q&A |
| **Claude Sonnet 4.5** | בינוני | בינוני | ✅ רוב המקרים — כתיבה, ניתוח, קוד |
| **Claude Opus 4.6** | יקר | יקר | ארכיטקטורה מורכבת, reasoning עמוק |

### מטריצת החלטה

```typescript
type ModelChoice = "claude-haiku-4-5-20251001" | "claude-sonnet-4-5-20250929" | "claude-opus-4-6";

function selectModel(task: {
  complexity: "simple" | "medium" | "complex";
  outputLength: "short" | "medium" | "long";
  requiresReasoning: boolean;
}): ModelChoice {
  // Simple tasks → Haiku
  if (task.complexity === "simple" && !task.requiresReasoning) {
    return "claude-haiku-4-5-20251001";
  }

  // Complex reasoning → Opus
  if (task.complexity === "complex" && task.requiresReasoning) {
    return "claude-opus-4-6";
  }

  // Default → Sonnet (best value)
  return "claude-sonnet-4-5-20250929";
}
```

### דוגמאות לפי Use Case

```
✅ Haiku:
- סיווג sentiment של תגובת משתמש
- חילוץ שדות מטקסט (שם, תאריך, סכום)
- תרגום קצר
- בדיקת validation logic פשוטה
- Q&A על טקסט ספציפי שסופק

✅ Sonnet (ברירת מחדל):
- כתיבת תוכן (מאמרים, עמודי נחיתה)
- ניתוח מסמך + סיכום
- כתיבת קוד feature בודד
- תשובה לשאלות טכניות
- review קוד

✅ Opus:
- ארכיטקטורת מערכת מורכבת
- debugging בעיות קשות
- multi-step reasoning
- כתיבת PRD מלא מאפס
- ניתוח משפטי/עסקי מורכב
```

---

## 2. Token Budgeting

### max_tokens לפי סוג בקשה

```typescript
const TOKEN_BUDGETS = {
  // סיווג קצר
  classification: 100,
  // תשובה קצרה
  short_answer: 500,
  // תשובה בינונית
  medium_answer: 1500,
  // כתיבת מאמר
  article: 3000,
  // כתיבת קוד
  code_feature: 4000,
  // ניתוח מעמיק
  analysis: 2000,
  // ברירת מחדל
  default: 2000,
} as const;

// שימוש
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: TOKEN_BUDGETS.article,
  messages: [{ role: "user", content: prompt }],
});
```

### ספירת tokens לפני שליחה

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

async function estimateTokens(prompt: string): Promise<number> {
  const result = await anthropic.messages.countTokens({
    model: "claude-sonnet-4-5-20250929",
    messages: [{ role: "user", content: prompt }],
  });
  return result.input_tokens;
}

// בדוק לפני שליחת בקשה יקרה
const tokenCount = await estimateTokens(largePrompt);
if (tokenCount > 10000) {
  // חלק את הprompt לחלקים קטנים יותר
  return await processInChunks(largePrompt);
}
```

### הגבלת context window

```typescript
// חתוך היסטוריית שיחה לפי token count, לא מספר הודעות
function trimConversationHistory(
  messages: Message[],
  maxTokens = 50000
): Message[] {
  let totalTokens = 0;
  const trimmed: Message[] = [];

  // עבור מהסוף (הכי חשוב לשמור הודעות אחרונות)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(messages[i]);
    if (totalTokens + msgTokens > maxTokens) break;
    trimmed.unshift(messages[i]);
    totalTokens += msgTokens;
  }

  return trimmed;
}
```

---

## 3. Prompt Caching

Prompt caching חוסך עלות כשמשתמשים שוב באותה system prompt גדולה.

### הפעלת caching

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: LARGE_SYSTEM_PROMPT,  // > 1024 tokens
      cache_control: { type: "ephemeral" },  // ✅ כסה אותה בcache
    },
  ],
  messages: [{ role: "user", content: userQuestion }],
});

// תוצאה: אחרי שמירה ב-cache, כל קריאה חוסכת ~90% מעלות ה-input
console.log(response.usage);
// { input_tokens: 15, cache_creation_input_tokens: 1200, cache_read_input_tokens: 0 }
// בקריאה שנייה: cache_read_input_tokens: 1200 (זול פי ~10)
```

### מתי כדאי?

```
✅ כדאי לcache:
- System prompts גדולות (>1024 tokens)
- מסמכי reference שחוזרים בכל בקשה
- ספר חוקים, knowledge base, schema DB

❌ לא כדאי:
- Prompts קצרות (<1024 tokens)
- תוכן שמשתנה בכל בקשה
- Single-use requests
```

### RAG עם caching

```typescript
// בנה context פעם אחת, cache אותו
const systemWithContext = `
You are a helpful assistant with access to this knowledge base:

${knowledgeBase}  // 5000 tokens of context

Always answer based on this information.
`;

// כל שאלת משתמש חוסכת את עלות ה-5000 tokens
const response = await anthropic.messages.create({
  system: [
    {
      type: "text",
      text: systemWithContext,
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [{ role: "user", content: userQuestion }],
  // ...
});
```

---

## 4. Application-level Caching

### Supabase כ-cache layer

```typescript
// lib/ai-cache.ts
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

export async function getCachedOrGenerate(
  prompt: string,
  generator: () => Promise<string>,
  ttlHours = 24
): Promise<string> {
  const supabase = await createClient();
  const hash = hashPrompt(prompt);

  // בדוק cache
  const { data: cached } = await supabase
    .from("ai_cache")
    .select("response")
    .eq("prompt_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (cached) return cached.response;

  // Generate
  const response = await generator();

  // שמור בcache
  await supabase.from("ai_cache").upsert({
    prompt_hash: hash,
    prompt: prompt.slice(0, 500),  // שמור תחילת ה-prompt לdebug
    response,
    expires_at: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
  });

  return response;
}
```

### DB Schema לcache

```sql
CREATE TABLE ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT UNIQUE NOT NULL,
  prompt TEXT,
  response TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_ai_cache_hash ON ai_cache(prompt_hash);
CREATE INDEX idx_ai_cache_expires ON ai_cache(expires_at);

-- Auto-cleanup expired cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM ai_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
```

### Redis Cache (מהיר יותר)

```typescript
// lib/redis-cache.ts (עם upstash/redis)
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds = 3600
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await redis.setex(key, ttlSeconds, result);
  return result;
}

// שימוש
const summary = await withCache(
  `summary:${articleId}`,
  () => generateSummary(article),
  86400  // 24 שעות
);
```

---

## 5. Streaming — UX ללא עלות נוספת

Streaming לא עולה יותר — רק משפר את חוויית המשתמש.

### Next.js Server Action עם streaming

```typescript
// app/actions/generate.ts
"use server";

import Anthropic from "@anthropic-ai/sdk";

export async function* generateContent(prompt: string) {
  const anthropic = new Anthropic();

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}
```

### Client Component

```typescript
"use client";

import { useState } from "react";
import { generateContent } from "@/app/actions/generate";

export function ContentGenerator() {
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async (prompt: string) => {
    setIsLoading(true);
    setOutput("");

    try {
      const stream = generateContent(prompt);
      for await (const chunk of stream) {
        setOutput((prev) => prev + chunk);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div dir="rtl">
      <button onClick={() => handleGenerate("כתוב מאמר על...")} disabled={isLoading}>
        {isLoading ? "מייצר..." : "צור תוכן"}
      </button>
      <div className="whitespace-pre-wrap">{output}</div>
    </div>
  );
}
```

---

## 6. Batch Processing עם n8n

עבור משימות שאינן real-time — batch הרבה יותר זול.

### Batch API Pattern (n8n workflow)

```
n8n Workflow: Daily Content Generation

1. Schedule Trigger (כל לילה 2:00)
2. Supabase: שלוף items שצריך לעבד (status = 'pending')
3. Loop Over Items (batch size: 10)
4. HTTP Request → Claude API (Haiku למשימות פשוטות)
5. Supabase: עדכן result + status = 'done'
6. Wait 1 second (rate limiting)
```

```json
// n8n HTTP Request node config
{
  "url": "https://api.anthropic.com/v1/messages",
  "method": "POST",
  "headers": {
    "x-api-key": "{{ $env.ANTHROPIC_API_KEY }}",
    "anthropic-version": "2023-06-01"
  },
  "body": {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 500,
    "messages": [
      {
        "role": "user",
        "content": "{{ $json.prompt }}"
      }
    ]
  }
}
```

### Rate Limiting בn8n

```
Add between API calls:
- Wait node: 500ms-1000ms
- Limit: max 50 requests per minute (Haiku)
- Error handling: retry on 529 (overloaded)
```

---

## 7. Cost Monitoring

### Anthropic Console

1. api.anthropic.com/dashboard → Usage
2. הגדר Billing Alerts: `Settings → Billing → Usage alerts`
3. הגדר limit חודשי

### Usage Tracking בApp

```typescript
// middleware לlog כל AI call
export async function trackAIUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  feature: string
) {
  await supabase.from("ai_usage_log").insert({
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    feature,
    estimated_cost_usd: calculateCost(model, inputTokens, outputTokens),
  });
}

function calculateCost(model: string, input: number, output: number): number {
  // עדכן לפי מחירון הנוכחי ב-anthropic.com/pricing
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },     // per 1K tokens
    "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
    "claude-opus-4-6": { input: 0.015, output: 0.075 },
  };
  const p = pricing[model] ?? pricing["claude-sonnet-4-5-20250929"];
  return (input / 1000) * p.input + (output / 1000) * p.output;
}
```

---

## 8. Infrastructure Cost

### Docker — חיסכון במשאבים

```yaml
# docker-compose.yml
services:
  app:
    # הגדר memory limit למנוע OOM
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
        reservations:
          memory: 256M
```

### Supabase — Tier Selection

```
Free Tier: בסדר לdev + פרויקטים קטנים
  - 500MB DB
  - 2GB bandwidth
  - 50k monthly active users

Pro ($25/month): כשיש משתמשים אמיתיים
  - 8GB DB
  - Daily backups
  - Custom domains
```

### Watchtower — אל תעדכן בשעות פעילות

```yaml
# docker-compose.yml בwatchtower
services:
  watchtower:
    environment:
      - WATCHTOWER_SCHEDULE=0 0 3 * * *  # 3AM בלבד
      - WATCHTOWER_CLEANUP=true           # מחק images ישנות = חוסך disk
```

---

## Quick Reference

```
💡 Model Decision Tree:
  - Extract/classify → Haiku
  - Write/analyze/code → Sonnet ✅
  - Complex reasoning/architecture → Opus

💡 Token Save:
  - max_tokens לפי צורך אמיתי
  - cache system prompts גדולות
  - cache results ב-Supabase/Redis

💡 Streaming:
  - תמיד לUX טוב — בחינם!

💡 Batch:
  - משימות לא-realtime → n8n + Haiku + לילה
```

---

## Related

- `/workflows` — n8n automation patterns
- `/optimization` — Web Vitals, caching
- `/api` — Server Actions, Supabase patterns
