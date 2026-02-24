import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const link = await prisma.productTemplateLink.findFirst({
            where: { productGid: 'gid://shopify/Product/7971803889721' },
            select: {
                id: true,
                template: {
                    include: {
                        fields: {
                            select: {
                                id: true,
                                variantMappingJson: true
                            }
                        }
                    }
                }
            }
        });
        console.log(JSON.stringify(link, null, 2));
    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
