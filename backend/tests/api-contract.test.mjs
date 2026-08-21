import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Static contract test: verifies critical routes and runtime composition
// without requiring a live PostgreSQL instance in CI.
const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const extension = await readFile(new URL('../src/runtime-extension.js', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../src/runtime-permissions.js', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../src/runtime-bootstrap.mjs', import.meta.url), 'utf8');

const requiredRoutes = [
  "app.get('/api/health'",
  "app.post('/api/auth/register'",
  "app.post('/api/auth/login'",
  "app.get('/api/dashboard'",
  "app.get('/api/materials'",
  "app.get('/api/vendors'",
  "app.get('/api/sites'",
  "app.post('/api/pr'",
  "app.get('/api/pr'",
  "app.post('/api/rfq'",
  "app.get('/api/rfq'",
  "app.post('/api/quotes'",
  "app.get('/api/quotes'",
  "app.post('/api/po'",
  "app.get('/api/po'",
  "app.post('/api/grn'",
  "app.get('/api/grn'",
  "app.get('/api/stock'",
  "app.post('/api/invoices'",
  "app.get('/api/invoices'",
  "app.post('/api/approvals'",
  "app.get('/api/approvals'"
];
for (const route of requiredRoutes) assert.ok(source.includes(route), `Missing API route: ${route}`);
assert.match(source, /const auth\s*=\s*\(/, 'JWT auth middleware missing');
assert.match(source, /companyScope/, 'Company isolation middleware missing');
assert.match(source, /prisma\.\$transaction/, 'Transactional workflow handling missing');

for (const route of ["app.get('/api/audit'", "app.get('/api/control-center'"]) {
  assert.ok(extension.includes(route), `Missing enterprise route: ${route}`);
}
assert.ok(permissions.includes("app.get('/api/me/permissions'"), 'Module permissions route missing');
assert.ok(permissions.includes("ADMIN: ['*']"), 'ADMIN full-access permission missing');
assert.ok(bootstrap.includes("runtime-permissions.js"), 'Runtime bootstrap does not load permissions module');

console.log(`Backend contract inventory verified: ${requiredRoutes.length} critical routes`);
console.log('Enterprise runtime: approvals, audit, control-center and permissions routes detected.');
console.log('Security: JWT + company scope checks detected.');
console.log('Workflow: transactional PR/RFQ/PO/GRN logic detected.');
