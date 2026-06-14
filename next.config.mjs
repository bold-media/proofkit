/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node built-in; keep it out of the bundle.
  serverExternalPackages: ['node:sqlite'],
}

export default nextConfig
