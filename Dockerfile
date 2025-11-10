FROM node:20-alpine

WORKDIR /app

# Copy only package files first for better layer caching
COPY package.json package-lock.json* ./

# ✅ Copy Prisma schema EARLY so postinstall (prisma generate) can run successfully
COPY prisma ./prisma

# Install production deps (postinstall will run and find the schema)
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the app
COPY . .

# Build the app (client + server)
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
