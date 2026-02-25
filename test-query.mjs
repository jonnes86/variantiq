import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const t = await prisma.template.findFirst({
        where: { id: 'cmly8zug70000s20dwf5wp1yu' },
        include: {
            fields: true,
            rules: true
        }
    });

    console.log("Fields:");
    console.log(JSON.stringify(t.fields, null, 2));

    console.log("SHOW rules:");
    console.log(JSON.stringify(t.rules.filter(r => r.actionType === 'SHOW'), null, 2));

    console.log("LIMIT rules:");
    console.log(JSON.stringify(t.rules.filter(r => r.actionType.includes('LIMIT')), null, 2));
}

check()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
