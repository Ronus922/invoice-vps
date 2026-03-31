---
name: native
description: React Native & Expo development - Monorepo architecture, code sharing between web and mobile, native components, EAS Build & Deploy.
---

# Native Mobile Development - React Native & Expo

> ארכיטקטורה לפיתוח אפליקציית מובייל איכותית עם **שיתוף קוד מקסימלי** בין Web (Next.js) ל-Mobile (Expo/React Native).

---

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [מבנה Monorepo](#מבנה-monorepo)
3. [הקמת פרויקט חדש](#הקמת-פרויקט-חדש)
4. [Shared Packages](#shared-packages)
5. [סנכרון דו-צדדי](#סנכרון-דו-צדדי)
6. [Styling - Tailwind & NativeWind](#styling)
7. [Navigation](#navigation)
8. [Authentication](#authentication)
9. [API & Data Layer](#api--data-layer)
10. [Build & Deploy](#build--deploy)
11. [Best Practices](#best-practices)

---

## סקירה כללית

### למה Monorepo + Expo?

```
┌─────────────────────────────────────────────────────────────┐
│                     MONOREPO (Turborepo)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│   │   apps/web   │    │ apps/mobile  │    │  apps/admin  │  │
│   │   (Next.js)  │    │   (Expo)     │    │  (Next.js)   │  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘          │
│                              │                              │
│   ┌──────────────────────────┴──────────────────────────┐   │
│   │              packages/ (SHARED CODE)                 │   │
│   ├──────────────┬──────────────┬───────────────────────┤   │
│   │    ui/       │   api/       │   utils/   │  types/  │   │
│   │  Components  │  API Client  │  Helpers   │   TS     │   │
│   │  (90% shared)│  (100%)      │  (100%)    │  (100%)  │   │
│   └──────────────┴──────────────┴───────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### יתרונות

| יתרון | תיאור |
|-------|-------|
| **שיתוף קוד 90%+** | Business logic, types, API, utils משותפים לחלוטין |
| **Type Safety** | TypeScript מקצה לקצה |
| **סנכרון אוטומטי** | שינוי ב-package משתקף מיד בכל האפליקציות |
| **Build מהיר** | Turborepo caching חוסך זמן build משמעותי |
| **DX מעולה** | Expo SDK 52+ מזהה monorepo אוטומטית |

---

## מבנה Monorepo

```
my-project/
├── apps/
│   ├── web/                    # Next.js 15 (App Router)
│   │   ├── src/
│   │   │   ├── app/           # Next.js pages
│   │   │   └── components/    # Web-specific components
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── tailwind.config.js
│   │
│   └── mobile/                 # Expo (React Native)
│       ├── src/
│       │   ├── app/           # Expo Router pages
│       │   └── components/    # Mobile-specific components
│       ├── app.json
│       ├── package.json
│       ├── metro.config.js
│       ├── babel.config.js
│       └── tailwind.config.js  # NativeWind
│
├── packages/
│   ├── ui/                     # Shared UI Components
│   ├── api/                    # Shared API Client
│   ├── utils/                  # Shared Utilities
│   └── types/                  # Shared TypeScript Types
│
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml         # Workspace config
├── package.json                # Root package.json
└── tsconfig.json               # Base TypeScript config
```

---

## הקמת פרויקט חדש

### 1. יצירת Monorepo בסיסי

```bash
mkdir my-app && cd my-app
git init
pnpm init
mkdir -p apps packages
```

### 2. הגדרת Workspace

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3. Root package.json

```json
{
  "name": "my-app",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "check-types": "turbo check-types",
    "dev:web": "turbo dev --filter=web",
    "dev:mobile": "turbo dev --filter=mobile",
    "build:web": "turbo build --filter=web",
    "build:mobile": "turbo build --filter=mobile"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### 4. Turborepo Config

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", ".expo/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "lint": { "dependsOn": ["^lint"] },
    "check-types": { "dependsOn": ["^check-types"] }
  }
}
```

### 5. יצירת Apps

```bash
# Next.js
cd apps
pnpm create next-app web --typescript --tailwind --app --use-pnpm

# Expo
npx create-expo-app mobile --template blank-typescript
cd mobile && rm package-lock.json && pnpm install
```

---

## Shared Packages

### packages/ui - Shared Components

```typescript
// packages/ui/src/Button.tsx
import { forwardRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

const variantStyles = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export const Button = forwardRef<View, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', onPress, disabled, className }, ref) => {
    const baseStyles = 'rounded-lg font-medium transition-colors';
    const styles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className || ''}`;

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={disabled}
        className={styles}
        style={({ pressed }) => [{ opacity: pressed || disabled ? 0.7 : 1 }]}
      >
        <Text className={variant === 'primary' ? 'text-white' : 'text-gray-900'}>
          {children}
        </Text>
      </Pressable>
    );
  }
);
Button.displayName = 'Button';
```

```json
// packages/ui/package.json
{
  "name": "@myapp/ui",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-native": "*"
  }
}
```

### packages/api - Shared API Client

```typescript
// packages/api/src/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
```

```typescript
// packages/api/src/hooks/useUser.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

export function useUser(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.users.getById(userId),
  });
}
```

### packages/utils - Shared Utilities

```typescript
// packages/utils/src/format.ts
export function formatDate(date: string | Date, locale = 'he-IL'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatCurrency(amount: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency }).format(amount);
}
```

---

## Styling - Tailwind & NativeWind

### Web (Tailwind)
```js
// apps/web/tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: { colors: { primary: '#3B82F6' } } },
};
```

### Mobile (NativeWind)
```js
// apps/mobile/tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: { primary: '#3B82F6' } } },
};
```

```js
// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: './global.css' });
```

### Platform-Specific Styling
```typescript
import { Platform, View } from 'react-native';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  const platformStyles = Platform.select({
    web: 'max-w-7xl mx-auto px-4',
    default: 'px-4',
  });
  return <View className={`${platformStyles} ${className || ''}`}>{children}</View>;
}
```

---

## Navigation

### Expo Router (Mobile)
```typescript
// apps/mobile/src/app/_layout.tsx
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#3B82F6' },
          headerTintColor: '#fff',
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'בית' }} />
        <Stack.Screen name="profile" options={{ title: 'פרופיל' }} />
      </Stack>
    </QueryClientProvider>
  );
}
```

---

## Authentication

### Shared Auth Logic
```typescript
// packages/api/src/auth.ts
import { supabase } from './client';

export const auth = {
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  onAuthStateChange: (callback: (session: any) => void) => {
    return supabase.auth.onAuthStateChange((event, session) => callback(session));
  },
};
```

---

## Build & Deploy

### Development
```bash
pnpm dev          # All apps
pnpm dev:web      # Next.js only
pnpm dev:mobile   # Expo only
```

### EAS Build
```bash
npm install -g eas-cli
eas login

cd apps/mobile
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile production --platform all
```

```json
// apps/mobile/eas.json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  },
  "submit": { "production": {} }
}
```

---

## Best Practices

### שיתוף קוד - מה כן ומה לא

| לשתף | לא לשתף |
|------|---------|
| Types & Interfaces | Navigation structure |
| API Client & Hooks | Native-specific features |
| Business Logic | Platform UI (when very different) |
| Validation Schemas | Config files |
| Utility Functions | Build scripts |
| Basic UI Components | Environment variables |

### כללי Package
```typescript
// נכון - Export נקי
import { Button } from '@myapp/ui';

// שגוי - Import ישיר מקובץ פנימי
import { Button } from '@myapp/ui/src/Button';
```

### Environment Variables
```bash
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### Type Safety מקצה לקצה
```typescript
// packages/types/src/database.ts
// Generate: npx supabase gen types typescript
export type Database = {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; name: string | null; created_at: string };
        Insert: { id?: string; email: string; name?: string | null };
        Update: { email?: string; name?: string | null };
      };
    };
  };
};

export type User = Database['public']['Tables']['users']['Row'];
```

---

## Quick Start Checklist

- [ ] יצירת מבנה תיקיות (apps/, packages/)
- [ ] הגדרת pnpm-workspace.yaml
- [ ] הגדרת turbo.json
- [ ] יצירת Next.js app
- [ ] יצירת Expo app
- [ ] יצירת packages/ui עם קומפוננטות בסיסיות
- [ ] יצירת packages/api עם Supabase client
- [ ] יצירת packages/types עם TypeScript types
- [ ] יצירת packages/utils עם utilities
- [ ] הגדרת NativeWind ב-Expo
- [ ] בדיקת סנכרון - שינוי ב-package משתקף בכל האפליקציות
- [ ] הגדרת EAS לבניית אפליקציה
