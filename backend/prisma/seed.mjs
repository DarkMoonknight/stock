import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = process.env.DEMO_ADMIN_EMAIL || 'admin@ezyprocure.local';
const password = process.env.DEMO_ADMIN_PASSWORD || 'EzyProcure@2026!';

try {
  const passwordHash = await bcrypt.hash(password, 12);
  let company = await prisma.company.findFirst({ where: { name: 'EzyProcure Demo Company' } });
  if (!company) company = await prisma.company.create({ data: { name: 'EzyProcure Demo Company' } });

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: 'ADMIN', companyId: company.id, name: 'EzyProcure Admin' },
    create: { email, passwordHash, active: true, role: 'ADMIN', companyId: company.id, name: 'EzyProcure Admin' }
  });

  const site = await prisma.site.upsert({
    where: { companyId_code: { companyId: company.id, code: 'MAIN' } },
    update: { name: 'Main Site', active: true },
    create: { companyId: company.id, code: 'MAIN', name: 'Main Site', location: 'India', active: true }
  });

  const materials = [
    ['CEMENT-001','OPC Cement 53 Grade','Construction','BAG'],
    ['STEEL-001','TMT Steel 12mm','Steel','MT'],
    ['SAND-001','River Sand','Construction','MT'],
    ['PIPE-001','MS Pipe 100mm','Piping','MTR']
  ];
  for (const [code,name,category,unit] of materials) {
    await prisma.material.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name, category, unit, active: true },
      create: { companyId: company.id, code, name, category, unit, active: true, gstRate: 18 }
    });
  }

  const vendors = [
    ['ABC Industrial Supplies','IN','INR'],
    ['Global Build Materials','IN','INR'],
    ['Prime Steel & Engineering','IN','INR']
  ];
  for (const [name,countryCode,currencyCode] of vendors) {
    const existing = await prisma.vendor.findFirst({ where: { companyId: company.id, name } });
    if (!existing) await prisma.vendor.create({ data: { companyId: company.id, name, countryCode, currencyCode, active: true, paymentDays: 30 } });
  }

  console.log(`Demo environment ready: ${email}; site=${site.code}; materials=${materials.length}; vendors=${vendors.length}`);
} finally {
  await prisma.$disconnect();
}
