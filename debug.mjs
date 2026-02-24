import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const templates = await prisma.template.findMany({
        include: {
            fields: true,
            rules: true
        }
    });

    console.log("TEMPLATES:", JSON.stringify(templates, null, 2));
}

run()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
