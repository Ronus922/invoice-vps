---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
source: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
---

# Frontend Design Skill

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

---

## Design Thinking

Before coding, understand the context and commit to a **BOLD** aesthetic direction:

| שאלה | מה לשאול |
|------|----------|
| **Purpose** | What problem does this interface solve? Who uses it? |
| **Tone** | Pick an extreme (see options below) |
| **Constraints** | Technical requirements (framework, performance, accessibility) |
| **Differentiation** | What makes this UNFORGETTABLE? What's the one thing someone will remember? |

### Tone Options (בחר כיוון ברור!)

- Brutally minimal
- Maximalist chaos
- Retro-futuristic
- Organic/natural
- Luxury/refined
- Playful/toy-like
- Editorial/magazine
- Brutalist/raw
- Art deco/geometric
- Soft/pastel
- Industrial/utilitarian

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

---

## Frontend Aesthetics Guidelines

### Typography

```tsx
// ❌ NEVER use generic fonts
font-family: Inter, Arial, Roboto, system-ui

// ✅ Choose distinctive fonts
font-family: 'Space Grotesk', 'Clash Display', 'Satoshi', 'Cabinet Grotesk'

// ✅ Pair display + body fonts
--font-display: 'Clash Display', sans-serif;  // Headlines
--font-body: 'Satoshi', sans-serif;           // Body text
```

### Color & Theme

```tsx
// ❌ Avoid cliché AI color schemes
// Purple gradients on white backgrounds
// Safe, evenly-distributed palettes

// ✅ Commit to a cohesive aesthetic
// Dominant colors with sharp accents
// Use CSS variables for consistency

:root {
  --color-dominant: #0a0a0a;
  --color-accent: #ff3b00;
  --color-muted: #737373;
}
```

### Motion & Animations

```tsx
// Focus on HIGH-IMPACT moments:
// - Page load with staggered reveals
// - Scroll-triggered animations
// - Hover states that surprise

// ✅ Staggered page load
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

// ✅ Scroll-triggered reveal
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
/>
```

### Spatial Composition

- Unexpected layouts
- Asymmetry
- Overlap
- Diagonal flow
- Grid-breaking elements
- Generous negative space OR controlled density

```tsx
// ✅ Grid-breaking hero
<section className="grid grid-cols-12 gap-4">
  <h1 className="col-span-8 col-start-2 text-8xl">
    Breaking the grid
  </h1>
  <div className="col-span-6 col-start-5 -mt-12">
    Overlapping content
  </div>
</section>
```

### Backgrounds & Visual Details

Create atmosphere and depth:

```tsx
// ✅ Gradient mesh background
<div className="
  bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900
  relative overflow-hidden
">
  {/* Noise texture overlay */}
  <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20" />

  {/* Gradient orbs */}
  <div className="absolute top-1/4 left-1/4 w-96 h-96
    bg-purple-500/30 rounded-full blur-3xl" />
</div>

// ✅ Creative effects
- Gradient meshes
- Noise textures
- Geometric patterns
- Layered transparencies
- Dramatic shadows
- Decorative borders
- Custom cursors
- Grain overlays
```

---

## Anti-Patterns (מה לא לעשות!)

### NEVER use generic AI aesthetics:

| ❌ Avoid | ✅ Instead |
|---------|-----------|
| Inter, Roboto, Arial, system fonts | Distinctive display fonts |
| Purple gradients on white | Bold, committed color schemes |
| Predictable layouts | Unexpected spatial composition |
| Cookie-cutter components | Context-specific character |
| Safe, even color distribution | Dominant + sharp accent |

### NEVER converge on common choices:

```tsx
// ❌ Every AI uses these
font-family: 'Space Grotesk'  // Overused
background: linear-gradient(to-r, purple, blue)  // Cliché
border-radius: 12px  // Too safe

// ✅ Be distinctive
font-family: 'Archivo Black'  // Different
background: #0a0a0a  // Committed
border-radius: 0  // Brutalist choice
```

---

## Implementation Rules

### Match complexity to aesthetic vision:

| Aesthetic | Implementation |
|-----------|----------------|
| **Maximalist** | Elaborate code, extensive animations, layered effects |
| **Minimalist** | Restraint, precision, careful spacing, subtle details |
| **Brutalist** | Raw, unpolished, intentionally rough |
| **Luxury** | Smooth transitions, refined typography, premium feel |

### Production Code Requirements:

```tsx
// ✅ Always deliver:
- Functional, working code
- Responsive design
- Accessible markup
- Performance optimized
- Real content (not lorem ipsum)
```

---

## Quick Start Checklist

Before building any frontend:

- [ ] Define PURPOSE - what problem does it solve?
- [ ] Choose TONE - commit to an aesthetic direction
- [ ] Select FONTS - distinctive, not generic
- [ ] Define COLORS - dominant + accent
- [ ] Plan MOTION - high-impact moments
- [ ] Design LAYOUT - unexpected composition
- [ ] Add ATMOSPHERE - textures, depth, details

---

## Resources

- [Frontend Aesthetics Cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- [Claude Code Plugins](https://github.com/anthropics/claude-code/tree/main/plugins)

---

> **Remember**: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
