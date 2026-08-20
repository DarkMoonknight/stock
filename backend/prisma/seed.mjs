import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@ezyprocure.local';
const adminPassword = process.env.DEMO_ADMIN_PASSWORD || 'EzyProcure@2026!';

const users = [
  { email: adminEmail, password: adminPassword, name: 'EzyProcure Owner', role: 'ADMIN', department: 'ADMIN' },
  { email: 'purchase@ezyprocure.local', password: 'Purchase@2026!', name: 'Purchase Manager', role: 'PROCUREMENT', department: 'PROCUREMENT' },
  { email: 'accounts@ezyprocure.local', password: 'Accounts@2026!', name: 'Accounts Manager', role: 'ACCOUNTS', department: 'ACCOUNTS' },
  { email: 'hr@ezyprocure.local', password: 'HR@2026!', name: 'HR Manager', role: 'HR', department: 'HR' },
  { email: 'engineer@ezyprocure.local', password: 'Engineer@2026!', name: 'Site Engineer', role: 'SITE_ENGINEER', department: 'SITE' },
  { email: 'store@ezyprocure.local', password: 'Store@2026!', name: 'Store Manager', role: 'SITE_STORE', department: 'STORE' },
  { email: 'management@ezyprocure.local', password: 'Management@2026!', name: 'Management Viewer', role: 'MANAGEMENT', department: 'MANAGEMENT' }
];

const departments = [
  ['ADMIN', 'Owner / Administration'],
  ['PROCUREMENT', 'Purchase & Procurement'],
  ['ACCOUNTS', 'Accounts & Finance'],
  ['HR', 'Human Resources'],
  ['SITE', 'Site Engineering'],
  ['STORE', 'Store & Inventory'],
  ['MANAGEMENT', 'Management']
];

try {
  let company = await prisma.company.findFirst({ where: { name: 'EzyProcure Demo Company' } });
  if (!company) company = await prisma.company.create({ data: { name: 'EzyProcure Demo Company' } });

  const deptMap = new Map();
  for (const [code, name] of departments) {
    const dept = await prisma.department.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name, active: true },
      create: { companyId: company.id, code, name, active: true }
    });
    deptMap.set(code, dept);
  }

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, active: true, role: u.role, companyId: company.id, departmentId: deptMap.get(u.department)?.id, name: u.name },
      create: { email: u.email, passwordHash, active: true, role: u.role, companyId: company.id, departmentId: deptMap.get(u.department)?.id, name: u.name }
    });
  }

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

  const employees = [
    ['EMP-001','Ravi Kumar','Site Engineer','SITE'],
    ['EMP-002','Neha Sharma','Purchase Executive','PROCUREMENT'],
    ['EMP-003','Amit Verma','Accounts Executive','ACCOUNTS'],
    ['EMP-004','Pooja Singh','HR Executive','HR']
  ];
  for (const [employeeCode,name,designation,deptCode] of employees) {
    await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId: company.id, employeeCode } },
      update: { name, designation, departmentId: deptMap.get(deptCode)?.id, active: true },
      create: { companyId: company.id, employeeCode, name, designation, departmentId: deptMap.get(deptCode)?.id, employmentType: 'FULL_TIME', active: true }
    });
  }

  const labour = [
    ['LAB-001','Mahesh Kumar','Mason'],
    ['LAB-002','Ramesh Yadav','Helper'],
    ['LAB-003','Sunil Kumar','Carpenter']
  ];
  for (const [labourCode,name,trade] of labour) {
    await prisma.labour.upsert({
      where: { companyId_labourCode: { companyId: company.id, labourCode } },
      update: { name, trade, active: true },
      create: { companyId: company.id, labourCode, name, trade, dailyRate: 750, active: true }
    });
  }

  console.log(`Enterprise demo ready: ${company.name}; site=${site.code}; departments=${departments.length}; users=${users.length}; employees=${employees.length}; labour=${labour.length}`);
} finally {
  await prisma.$disconnect();
}
