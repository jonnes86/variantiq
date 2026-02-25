import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const t = await prisma.template.findFirst({
        where: { id: 'cmly8zug70000s20dwf5wp1yu' },
        include: { fields: true, rules: { orderBy: { sort: 'asc' } } }
    });

    process.stdout.write(`Total rules: ${t.rules.length}\n`);
    process.stdout.write(`Total fields: ${t.fields.length}\n\n`);

    for (const r of t.rules) {
        const conds = typeof r.conditionsJson === 'string' ? JSON.parse(r.conditionsJson) : (r.conditionsJson || []);
        const opts = (() => { try { return typeof r.targetOptionsJson === 'string' ? JSON.parse(r.targetOptionsJson) : r.targetOptionsJson; } catch (e) { return null; } })();
        const targetField = t.fields.find(f => f.id === r.targetFieldId);
        process.stdout.write(`[sort=${r.sort}][${r.actionType}] → "${targetField?.name || r.targetFieldId}"\n`);
        for (const c of conds) {
            const srcField = t.fields.find(f => f.id === c.fieldId);
            process.stdout.write(`  IF "${srcField?.name || c.fieldId}" ${c.operator} "${c.value}"\n`);
        }
        if (opts && typeof opts === 'object') process.stdout.write(`  opts: ${JSON.stringify(opts)}\n`);
        process.stdout.write('\n');
    }
}

check().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
