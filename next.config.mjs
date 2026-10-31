/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // With a proxy.ts present Next buffers every request body (default 10MB) and
    // silently truncates the rest — no error, the route just gets a partial body.
    // Keep equal to MAX_FILE_SIZE in src/app/api/upload/route.ts (and nginx's
    // client_max_body_size) so an upload the route accepts is never cut short.
    proxyClientMaxBodySize: '20mb',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // frame-ancestors only — a full script-src CSP needs nonces for
          // Next's inline scripts and is a separate project.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera stays enabled for self — the upload flow shoots invoices.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
export default nextConfig
