import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
    await prisma.field.delete({
        where: { id: 'cmm1h866o0001nr0drhuhl2or' }
    });
    console.log("Deleted orphaned field cmm1h866o0001nr0drhuhl2or (bella+canvas_adult_ss_colors)");
}

fix()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
