import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    const templates = await prisma.template.findMany({
        include: { fields: true, rules: true }
    });
    console.log(JSON.stringify(templates, null, 2));

    const links = await prisma.productTemplateLink.findMany();
    console.log("LINKS:");
    console.log(JSON.stringify(links, null, 2));
}
run();
