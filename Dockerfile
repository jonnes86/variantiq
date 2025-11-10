FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
ENV PRISMA_SKIP_POSTINSTALL=1
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]