import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_URL || 'https://darkmoonknight.github.io').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

const signToken = user => jwt.sign(
  { userId: user.id, companyId: user.companyId, role: user.role, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

const auth = (req,res,next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({error:'Authentication required'});
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({error:'Invalid or expired token'}); }
};
const companyScope = (req,res,next) => { if (!req.user?.companyId) return res.status(403).json({error:'Company scope missing'}); next(); };
const role = (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({error:'Insufficient permissions'});

app.get('/', (_req,res) => res.json({ok:true, service:'ezyprocure-api', status:'online'}));
app.get('/health', async (_req,res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ok:true, service:'ezyprocure-api', database:'connected'}); }
  catch { res.status(503).json({ok:false, service:'ezyprocure-api', database:'unavailable'}); }
});
app.get('/api/health', async (_req,res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ok:true, service:'ezyprocure-api', database:'connected'}); }
  catch { res.status(503).json({ok:false, service:'ezyprocure-api', database:'unavailable'}); }
});

const registerSchema = z.object({companyName:z.string().min(2).max(120),name:z.string().min(2).max(120),email:z.string().email(),password:z.string().min(10).max(100)});
app.post('/api/auth/register', async (req,res,next) => {
  try {
    const input=registerSchema.parse(req.body);
    const existing=await prisma.user.count();
    if(existing>0) return res.status(403).json({error:'Initial registration is closed. Ask an administrator to create your account.'});
    const passwordHash=await bcrypt.hash(input.password,12);
    const result=await prisma.$transaction(async tx=>{
      const company=await tx.company.create({data:{name:input.companyName}});
      const user=await tx.user.create({data:{companyId:company.id,name:input.name,email:input.email.toLowerCase(),passwordHash,role:'ADMIN'}});
      return {company,user};
    });
    res.status(201).json({token:signToken(result.user),user:{id:result.user.id,name:result.user.name,email:result.user.email,role:result.user.role,companyId:result.user.companyId},company:{id:result.company.id,name:result.company.name}});
  } catch(err){ next(err); }
});

const loginSchema=z.object({email:z.string().email(),password:z.string().min(1)});
app.post('/api/auth/login', async(req,res,next)=>{
  try {
    const input=loginSchema.parse(req.body);
    const user=await prisma.user.findUnique({where:{email:input.email.toLowerCase()},include:{company:true}});
    if(!user || !user.active || !(await bcrypt.compare(input.password,user.passwordHash))) return res.status(401).json({error:'Invalid email or password'});
    res.json({token:signToken(user),user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.companyId},company:{id:user.company.id,name:user.company.name}});
  } catch(err){ next(err); }
});
app.get('/api/auth/me',auth,companyScope,async(req,res,next)=>{
  try { const user=await prisma.user.findFirst({where:{id:req.user.userId,companyId:req.user.companyId,active:true},select:{id:true,name:true,email:true,role:true,companyId:true,company:{select:{id:true,name:true}}}}); if(!user)return res.status(401).json({error:'User not found'}); res.json(user); } catch(err){next(err);}
});

app.get('/api/dashboard', auth, companyScope, async (req,res,next) => {
  try {
    const companyId=req.user.companyId;
    const [prs,rfqs,pos,grns,invoices,vendors] = await Promise.all([
      prisma.purchaseRequisition.count({where:{companyId,status:{in:['DRAFT','PENDING']}}}),
      prisma.rFQ.count({where:{companyId,status:{in:['DRAFT','SENT']}}}),
      prisma.purchaseOrder.count({where:{companyId,status:{in:['DRAFT','APPROVED','SENT','PARTIAL']}}}),
      prisma.gRN.count({where:{companyId,status:{in:['DRAFT','APPROVED']}}}),
      prisma.invoice.count({where:{companyId,status:{in:['PENDING','PARTIAL']}}}),
      prisma.vendor.count({where:{companyId,active:true}})
    ]);
    res.json({pendingPR:prs,pendingRFQ:rfqs,openPO:pos,openGRN:grns,pendingInvoices:invoices,activeVendors:vendors});
  } catch(err){next(err);}
});

app.get('/api/materials', auth, companyScope, async (req,res,next)=>{try{res.json(await prisma.material.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}}));}catch(err){next(err);}});
app.get('/api/vendors', auth, companyScope, async (req,res,next)=>{try{res.json(await prisma.vendor.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}}));}catch(err){next(err);}});
app.get('/api/sites', auth, companyScope, async (req,res,next)=>{try{res.json(await prisma.site.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}}));}catch(err){next(err);}});

const prSchema=z.object({siteId:z.string(),requestedBy:z.string().min(1),requiredDate:z.coerce.date(),notes:z.string().optional(),items:z.array(z.object({materialId:z.string(),quantity:z.coerce.number().positive(),estimatedRate:z.coerce.number().nonnegative().optional()})).min(1)});
app.post('/api/pr',auth,companyScope,role('ADMIN','PROCUREMENT','SITE_STORE'),async(req,res,next)=>{
  try {
    const input=prSchema.parse(req.body);
    const site=await prisma.site.findFirst({where:{id:input.siteId,companyId:req.user.companyId,active:true}});
    if(!site)return res.status(400).json({error:'Invalid site'});
    const materialIds=[...new Set(input.items.map(i=>i.materialId))];
    const materialCount=await prisma.material.count({where:{companyId:req.user.companyId,active:true,id:{in:materialIds}}});
    if(materialCount!==materialIds.length)return res.status(400).json({error:'One or more materials are invalid for this company'});
    const number=`PR-${new Date().getFullYear().toString().slice(-2)}-${Date.now().toString().slice(-7)}`;
    const pr=await prisma.purchaseRequisition.create({data:{companyId:req.user.companyId,siteId:input.siteId,number,requestedBy:input.requestedBy,requiredDate:input.requiredDate,notes:input.notes,status:'PENDING',items:{create:input.items}},include:{items:true}});
    res.status(201).json(pr);
  } catch(err){next(err);}
});

app.get('/api/pr',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.purchaseRequisition.findMany({where:{companyId:req.user.companyId},include:{items:{include:{material:true}},site:true},orderBy:{createdAt:'desc'}}));}catch(err){next(err);}});
app.get('/api/rfq',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.rFQ.findMany({where:{companyId:req.user.companyId},include:{pr:true,vendors:{include:{vendor:true}},quotes:true},orderBy:{dueDate:'asc'}}));}catch(err){next(err);}});
app.get('/api/po',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.purchaseOrder.findMany({where:{companyId:req.user.companyId},include:{vendor:true,site:true,items:{include:{material:true}}},orderBy:{orderDate:'desc'}}));}catch(err){next(err);}});
app.get('/api/grn',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.gRN.findMany({where:{companyId:req.user.companyId},include:{po:true,site:true,items:{include:{material:true}}},orderBy:{receivedAt:'desc'}}));}catch(err){next(err);}});
app.get('/api/invoices',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.invoice.findMany({where:{companyId:req.user.companyId},include:{vendor:true,po:true},orderBy:{dueDate:'asc'}}));}catch(err){next(err);}});

app.use((err,_req,res,_next)=>{ if(err?.name==='ZodError') return res.status(400).json({error:'Validation failed',details:err.issues}); console.error(err); res.status(500).json({error:'Internal server error'}); });
const port=Number(process.env.PORT||4000);
const server=app.listen(port,()=>console.log(`EzyProcure API listening on ${port}`));
process.on('SIGTERM',async()=>{server.close(async()=>{await prisma.$disconnect();process.exit(0);});});
