// app/db.server.ts
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  prisma = global.__prisma ?? new PrismaClient();
  global.__prisma = prisma;
}

export { prisma };
