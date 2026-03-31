// ============================================================
// Next.js Local Font Setup (next/font/local)
// Copy to: src/lib/fonts.ts or app/fonts.ts
// ============================================================

import localFont from 'next/font/local'

export const rubik = localFont({
  src: [
    { path: '../public/fonts/rubik/rubik-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/rubik/rubik-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/rubik/rubik-600.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/rubik/rubik-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-rubik',
  display: 'swap',
})

export const assistant = localFont({
  src: [
    { path: '../public/fonts/assistant/assistant-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/assistant/assistant-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/assistant/assistant-600.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/assistant/assistant-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-assistant',
  display: 'swap',
})

export const heebo = localFont({
  src: [
    { path: '../public/fonts/heebo/heebo-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/heebo/heebo-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/heebo/heebo-600.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/heebo/heebo-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-heebo',
  display: 'swap',
})

// ============================================================
// Usage in layout.tsx:
// ============================================================
//
// import { rubik, assistant } from '@/lib/fonts'
//
// export default function RootLayout({ children }) {
//   return (
//     <html lang="he" dir="rtl" className={`${rubik.variable} ${assistant.variable}`}>
//       <body className="font-assistant">{children}</body>
//     </html>
//   )
// }
//
// ============================================================
// Tailwind v4 (globals.css):
// ============================================================
//
// @theme {
//   --font-rubik: 'Rubik', sans-serif;
//   --font-assistant: 'Assistant', sans-serif;
// }
//
// Then use: font-rubik for headings, font-assistant for body
