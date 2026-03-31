---
name: animations
description: Animation timing scale and quick reference. Use when planning animation durations, stagger timing, or choosing easing functions.
---

# Animation Scale - Quick Reference ⚡

## Universal Timing Scale

| Type | Duration | Use For |
|------|----------|---------|
| **Micro** | 100-150ms | Button press, toggle |
| **Fast** | 200-300ms | Hover, tooltip |
| **Base** | 400-500ms | Modal, dropdown, fade |
| **Moderate** | 600-800ms | Card flip, slide |
| **Slow** | 1-1.5s | Hero entrance, reveal |
| **Cinematic** | 2-3s | Counter, storytelling |

## Stagger Scale

| Grid Size | Stagger | Example |
|-----------|---------|---------|
| 1-5 items | 0.05-0.08s | Nav items |
| 6-12 items | 0.03-0.05s | Card grid |
| 13-24 items | 0.02-0.03s | Gallery |
| 25+ items | 0.01-0.02s | Table rows |

## Easing Quick Pick

- `power2.out` - **Default** (natural, use 90% of the time)
- `power1.out` - Subtle (text, opacity)
- `power3.out` - Punchy (CTAs)
- `back.out(1.7)` - Playful (micro-interactions)
- `elastic.out` - Springy (success states)
- `expo.out` - Dramatic (hero sections)

## Common Patterns

```tsx
// Fade in on scroll
gsap.from('.element', {
  opacity: 0,
  y: 30,
  duration: 0.5,        // Base timing
  ease: 'power2.out',   // Natural easing
  stagger: 0.05         // For multiple elements
})

// Hover effect
gsap.to('.button', {
  scale: 1.05,
  duration: 0.2,        // Fast timing
  ease: 'power2.out'
})

// Modal open
gsap.from('.modal', {
  opacity: 0,
  scale: 0.95,
  duration: 0.4,        // Base timing
  ease: 'back.out(1.4)' // Slight bounce
})
```

## Decision Tree

1. **Micro-interaction?** → 0.2-0.3s, power2.out
2. **Layout change?** → 0.4-0.5s, power2.out
3. **Dramatic reveal?** → 0.8-1.5s, expo.out
4. **Scroll-based?** → scrub: 1, ease: 'none'

## ❌ Don't Do This

- Duration > 2s (feels broken)
- Stagger > 0.5s (too slow)
- Animating width/height (use scale)
- Forgetting reduced motion

---

## Full Documentation

For complete GSAP, ScrollTrigger, Framer Motion, and Lenis documentation:
→ Read `fullstack-il/ANIMATIONS.md` (58KB complete guide)

## Quick Install

```bash
pnpm add gsap @gsap/react framer-motion lenis
```

## GSAP Template

```tsx
'use client'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/lib/gsap'

export function MyComponent() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from('.item', {
      opacity: 0,
      y: 30,
      duration: 0.5,
      stagger: 0.05,
      ease: 'power2.out'
    })
  }, { scope: containerRef })

  return <div ref={containerRef}>...</div>
}
```

## Framer Motion Template

```tsx
'use client'
import { motion } from 'framer-motion'

export function MyComponent() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      Content
    </motion.div>
  )
}
```

---

**Remember:** When in doubt → 0.5s, power2.out
