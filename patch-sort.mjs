import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const templates = await prisma.template.findMany({
        include: { fields: true }
    });

    for (const template of templates) {
        if (template.shop === 'crazyllamakids.myshopify.com') {
            const firstRowField = template.fields.find(f => f.name === 'FirstRowSizeType');
            if (firstRowField) {
                console.log("Found FirstRowSizeType field! Patching sort order to 0...");
                await prisma.field.update({
                    where: { id: firstRowField.id },
                    data: { sort: 0 }
                });
                console.log("Successfully patched to sort: 0");
            }
        }
    }
}

run()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
