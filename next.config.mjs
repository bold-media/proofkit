/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node built-in; keep it out of the bundle.
  serverExternalPackages: ['node:sqlite'],
  // The comment overlay is loaded from stable URLs (/overlay.js, /overlay.css)
  // injected into client designs. Without this, browsers cache them and clients
  // keep running an old overlay after a deploy. "no-cache" lets the browser
  // revalidate each load (304 when unchanged) so updates land immediately.
  async headers() {
    return [
      {
        source: '/overlay.:ext(js|css)',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]
  },
}

export default nextConfig
