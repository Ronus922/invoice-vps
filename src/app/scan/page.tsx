import ScanScreen from '@/components/scan/ScanScreen'

// "סרוק קבלה" — behind the session + allowlist like every other page (src/proxy.ts redirects a
// visitor without one to /login).
export default function ScanPage() {
  return <ScanScreen />
}
