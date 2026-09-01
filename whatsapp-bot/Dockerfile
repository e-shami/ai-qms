# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build TypeScript
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN addgroup -S nodejs && adduser -S whatsappbot -G nodejs

COPY --from=builder --chown=whatsappbot:nodejs /app/dist ./dist
COPY --from=builder --chown=whatsappbot:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=whatsappbot:nodejs /app/package.json ./

USER whatsappbot
EXPOSE 3000

CMD ["node", "dist/index.js"]