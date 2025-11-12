# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs

# Copy everything from build stage
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/package.json ./package.json

# Add these for debugging
RUN ls -la /app/build/server/ || echo "build/server missing"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "require('http').get('http://localhost:8080/healthz', r => process.exit(r.statusCode===200?0:1)).on('error', ()=>process.exit(1))"

CMD ["npm","run","start"]