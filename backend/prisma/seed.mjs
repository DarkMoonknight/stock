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
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: 'ADMIN', companyId: company.id, name: 'EzyProcure Admin' },
    create: { email, passwordHash, active: true, role: 'ADMIN', companyId: company.id, name: 'EzyProcure Admin' }
  });
  console.log(`Demo admin ready: ${user.email}`);
} finally {
  await prisma.$disconnect();
}
