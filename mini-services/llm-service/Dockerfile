# LLM mini-service — Node/Bun + z-ai-web-dev-sdk.
FROM oven/bun:1.1-alpine

WORKDIR /app

# Install deps (z-ai-web-dev-sdk is declared in package.json)
COPY package.json ./
RUN bun install --frozen-lockfile || bun install

# App source
COPY index.ts ./

ENV NODE_ENV=production
EXPOSE 3003

# Bun's built-in server
CMD ["bun", "index.ts"]
