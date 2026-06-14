# Proofkit production image. Node 24 is required for the built-in node:sqlite.
FROM node:24-alpine

WORKDIR /app

# pnpm via corepack
RUN corepack enable

# Install dependencies (cached unless lockfile changes)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Build the app
COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
# Store the SQLite database on a mounted volume so it survives redeploys.
ENV PROOFKIT_DB=/data/proofkit.db

# Make sure the data directory exists even before a volume is mounted.
RUN mkdir -p /data

EXPOSE 3000

CMD ["pnpm", "start"]
