# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
# ensure postinstall doesn't run before prisma/schema exists
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Railway sets PORT, don't hardcode
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
# If you keep any public assets:
# COPY --from=build /app/public ./public

# Start: apply DB migrations then run the server
CMD ["sh", "-c", "node -v && npm run start"]
