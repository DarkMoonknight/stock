import fs from 'node:fs';
import assert from 'node:assert/strict';

const server = fs.readFileSync(new URL('../src/enterprise-server.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

const requiredModules = [
  'sites','materials','vendors','pr','rfq','quotes','po','grn','mrn','stock',
  'invoices','payments','expenses','employees','attendance','labour',
  'labourAttendance','tasks','reports','approvals'
];

assert.match(server, /const role=\(\.\.\.roles\)=>roles\.includes\(req\.user\?\.role\)\|\|req\.user\?\.role==='ADMIN'/,
  'ADMIN must retain authorized full-control access through the role middleware');
assert.match(server, /ADMIN:\['\*'\]/, 'ADMIN must receive wildcard permissions');

for (const module of requiredModules) {
  assert.match(server, new RegExp(`\\b${module}:true\\b`), `module contract missing: ${module}`);
}

for (const guard of ['auth','companyScope']) {
  assert.match(server, new RegExp(`const ${guard}=`), `security guard missing: ${guard}`);
}

assert.match(server, /companyId:req\.user\.companyId/, 'company isolation must be enforced from the authenticated token');
assert.match(server, /prisma\.auditLog\.create/, 'audit logging must remain enabled');
assert.match(schema, /model AuditLog/, 'AuditLog model must remain in the production schema');
assert.match(schema, /model Company/, 'Company model must remain in the production schema');
assert.match(schema, /model User/, 'User model must remain in the production schema');

console.log('Admin control contract: PASS');
