import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const extension = await readFile(new URL('../src/runtime-extension.js', import.meta.url), 'utf8');
const render = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

for (const route of [
  "app.get('/api/audit'",
  "app.get('/api/approvals'",
  "app.post('/api/approvals'",
  "app.patch('/api/approvals/:id'",
  "app.get('/api/approvals/:entityType/:entityId'",
  "app.get('/api/control-center'"
]) assert.ok(extension.includes(route), `Missing enterprise route: ${route}`);

for (const entity of ['PR','RFQ','PO','GRN','MRN','INVOICE','EXPENSE','TASK']) {
  assert.ok(extension.includes(`${entity}:`), `Missing approval entity: ${entity}`);
}

assert.match(extension, /Rejection comment is required/);
assert.match(extension, /prisma\.\$transaction/);
assert.match(extension, /companyId: req\.user\.companyId/);
assert.match(render, /startCommand: .*runtime-bootstrap\.mjs/);
assert.match(render, /value: https:\/\/vaquitecalifornia\.com/);
assert.equal(packageJson.type, 'module');
console.log('Enterprise workflow contract verified: create/edit -> approval/rejection -> audit/control -> report-ready data.');
