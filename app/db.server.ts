// app/db.server.ts
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

let prisma: InstanceType<typeof PrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: InstanceType<typeof PrismaClient> | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  prisma = global.__prisma ?? new PrismaClient();
  global.__prisma = prisma;
}

export { prisma };         // named export
export default prisma;     // default export to match existing imports