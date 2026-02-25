import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const rules = await prisma.rule.findMany({
        where: { actionType: 'LIMIT_OPTIONS_DATASET' }
    });
    console.log(JSON.stringify(rules, null, 2));
}

check()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
