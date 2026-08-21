import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const serverPath = path.join(root, 'src', 'server.js');
const extensionPath = path.join(root, 'src', 'runtime-extension.js');
const permissionsPath = path.join(root, 'src', 'runtime-permissions.js');
const [serverSource, extensionSource, permissionsSource] = await Promise.all([
  fs.readFile(serverPath, 'utf8'),
  fs.readFile(extensionPath, 'utf8'),
  fs.readFile(permissionsPath, 'utf8')
]);

// server.js contains the stable core API plus its legacy approval/listener tail.
// Build one runtime module so the enterprise extension shares the same app,
// Prisma client and auth middleware instead of running in a separate scope.
const core = serverSource.replace(
  /app\.post\('\/api\/approvals'[\s\S]*?process\.on\('SIGTERM'[\s\S]*?\);\s*$/,
  ''
);

const auditHelper = `
const audit = async (req, action, entityType, entityId, before, after) => {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: req.user.companyId,
        userId: req.user.userId || null,
        action,
        entityType,
        entityId: entityId || null,
        beforeJson: before == null ? null : JSON.stringify(before),
        afterJson: after == null ? null : JSON.stringify(after),
        ipAddress: req.ip || null
      }
    });
  } catch (err) {
    console.error('Audit write failed:', err);
  }
};
`;

const tail = `
app.use((err,_req,res,_next)=>{
  if(err?.name==='ZodError') return res.status(400).json({error:'Validation failed',details:err.issues});
  console.error(err);
  res.status(500).json({error:'Internal server error'});
});
const port=Number(process.env.PORT||4000);
const server=app.listen(port,()=>console.log('EzyProcure API listening on '+port));
process.on('SIGTERM',async()=>{server.close(async()=>{await prisma.$disconnect();process.exit(0);});});
`;

const combined = `${core}\n${auditHelper}\n${extensionSource}\n${permissionsSource}\n${tail}`;
const runtimePath = path.join(os.tmpdir(), `ezyprocure-runtime-${process.pid}.mjs`);
await fs.writeFile(runtimePath, combined, 'utf8');
process.on('exit', () => { try { require('node:fs').unlinkSync(runtimePath); } catch {} });
await import(pathToFileURL(runtimePath).href + `?build=${Date.now()}`);
