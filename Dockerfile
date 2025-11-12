# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
ENV CI=1
# only package manifests first
COPY package.json package-lock.json ./
# don't run postinstall yet (prisma generate)
RUN npm ci --ignore-scripts

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
# use the deps node_modules
COPY --from=deps /app/node_modules ./node_modules
# copy prisma first so we can generate the client
COPY prisma ./prisma
RUN npx prisma generate
# now copy the rest and build
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# optional non-root user
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs
# bring only what we need to run
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=deps  /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3000
# simple healthcheck hitting your /healthz route
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "require('http').get('http://localhost:3000/healthz', r => process.exit(r.statusCode===200?0:1)).on('error', ()=>process.exit(1))"

# run migrations then serve Remix build
CMD ["npm","run","start"]