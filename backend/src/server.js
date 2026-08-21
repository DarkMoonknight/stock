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

const defaultOrigins = [
  'https://vaquitecalifornia.com',
  'https://vaquitecalifornia.com',
  'https://www.vaquitecalifornia.com',
  'https://darkmoonknight.github.io'
];
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(v => v.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
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

app.get('/api/modules', auth, companyScope, (_req,res)=>res.json({
  sites:{active:true},materials:{active:true},vendors:{active:true},pr:{active:true},rfq:{active:true},quotes:{active:true},po:{active:true},grn:{active:true},stock:{active:true},invoices:{active:true},reports:{active:true},approvals:{active:true},ai:{active:Boolean(process.env.OPENAI_API_KEY)}
}));

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

const rfqSchema=z.object({prId:z.string(),dueDate:z.coerce.date(),vendorIds:z.array(z.string()).min(1)});
app.post('/api/rfq',auth,companyScope,role('ADMIN','PROCUREMENT'),async(req,res,next)=>{try{
  const input=rfqSchema.parse(req.body);
  const pr=await prisma.purchaseRequisition.findFirst({where:{id:input.prId,companyId:req.user.companyId},include:{items:true}});
  if(!pr)return res.status(404).json({error:'PR not found'});
  const vendors=await prisma.vendor.findMany({where:{id:{in:input.vendorIds},companyId:req.user.companyId,active:true}});
  if(vendors.length!==new Set(input.vendorIds).size)return res.status(400).json({error:'Invalid vendor selection'});
  const number=`RFQ-${new Date().getFullYear().toString().slice(-2)}-${Date.now().toString().slice(-7)}`;
  const rfq=await prisma.$transaction(async tx=>{
    const created=await tx.rFQ.create({data:{companyId:req.user.companyId,prId:pr.id,number,dueDate:input.dueDate,status:'SENT',vendors:{create:vendors.map(v=>({vendorId:v.id}))}},include:{vendors:{include:{vendor:true}},pr:true}});
    await tx.purchaseRequisition.update({where:{id:pr.id},data:{status:'APPROVED'}});
    return created;
  });
  res.status(201).json(rfq);
}catch(err){next(err);}});
app.get('/api/rfq',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.rFQ.findMany({where:{companyId:req.user.companyId},include:{pr:true,vendors:{include:{vendor:true}},quotes:{include:{items:true,vendor:true}}},orderBy:{dueDate:'asc'}}));}catch(err){next(err);}});

const quoteSchema=z.object({rfqId:z.string(),vendorId:z.string(),quoteNo:z.string().optional(),freight:z.coerce.number().nonnegative().default(0),tax:z.coerce.number().nonnegative().default(0),validUntil:z.coerce.date().optional(),items:z.array(z.object({materialId:z.string(),quantity:z.coerce.number().positive(),unitRate:z.coerce.number().nonnegative()})).min(1)});
app.post('/api/quotes',auth,companyScope,role('ADMIN','PROCUREMENT'),async(req,res,next)=>{try{
  const input=quoteSchema.parse(req.body);
  const rfq=await prisma.rFQ.findFirst({where:{id:input.rfqId,companyId:req.user.companyId},include:{pr:true}});
  const vendor=await prisma.vendor.findFirst({where:{id:input.vendorId,companyId:req.user.companyId,active:true}});
  if(!rfq||!vendor)return res.status(404).json({error:'RFQ or vendor not found'});
  const allowed=await prisma.rFQVendor.findFirst({where:{rfqId:rfq.id,vendorId:vendor.id}});
  if(!allowed)return res.status(400).json({error:'Vendor is not invited to this RFQ'});
  const itemTotal=input.items.reduce((s,i)=>s+i.quantity*i.unitRate,0);
  const total=itemTotal+input.freight+input.tax;
  const quote=await prisma.quote.create({data:{rfqId:rfq.id,vendorId:vendor.id,quoteNo:input.quoteNo,freight:input.freight,tax:input.tax,validUntil:input.validUntil,total,items:{create:input.items}},include:{vendor:true,items:true}});
  res.status(201).json(quote);
}catch(err){next(err);}});
app.get('/api/quotes',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.quote.findMany({where:{rfq:{companyId:req.user.companyId}},include:{vendor:true,rfq:true,items:{include:{material:true}}},orderBy:{total:'asc'}}));}catch(err){next(err);}});

const poSchema=z.object({siteId:z.string(),vendorId:z.string(),prId:z.string().optional(),items:z.array(z.object({materialId:z.string(),orderedQty:z.coerce.number().positive(),rate:z.coerce.number().nonnegative()})).min(1),tax:z.coerce.number().nonnegative().default(0)});
app.post('/api/po',auth,companyScope,role('ADMIN','PROCUREMENT'),async(req,res,next)=>{try{
  const input=poSchema.parse(req.body);
  const [site,vendor]=await Promise.all([
    prisma.site.findFirst({where:{id:input.siteId,companyId:req.user.companyId,active:true}}),
    prisma.vendor.findFirst({where:{id:input.vendorId,companyId:req.user.companyId,active:true}})
  ]);
  if(!site||!vendor)return res.status(400).json({error:'Invalid site or vendor'});
  const materialIds=[...new Set(input.items.map(i=>i.materialId))];
  const count=await prisma.material.count({where:{id:{in:materialIds},companyId:req.user.companyId,active:true}});
  if(count!==materialIds.length)return res.status(400).json({error:'Invalid material selection'});
  const subtotal=input.items.reduce((s,i)=>s+i.orderedQty*i.rate,0); const total=subtotal+input.tax;
  const number=`PO-${new Date().getFullYear().toString().slice(-2)}-${Date.now().toString().slice(-7)}`;
  const po=await prisma.purchaseOrder.create({data:{companyId:req.user.companyId,siteId:site.id,vendorId:vendor.id,prId:input.prId,number,status:'APPROVED',subtotal,tax:input.tax,total,items:{create:input.items}},include:{vendor:true,site:true,items:true}});
  res.status(201).json(po);
}catch(err){next(err);}});
app.get('/api/po',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.purchaseOrder.findMany({where:{companyId:req.user.companyId},include:{vendor:true,site:true,items:{include:{material:true}}},orderBy:{orderDate:'desc'}}));}catch(err){next(err);}});

const grnSchema=z.object({poId:z.string(),items:z.array(z.object({materialId:z.string(),receivedQty:z.coerce.number().positive(),rejectedQty:z.coerce.number().nonnegative().default(0)})).min(1)});
app.post('/api/grn',auth,companyScope,role('ADMIN','SITE_STORE'),async(req,res,next)=>{try{
  const input=grnSchema.parse(req.body);
  const po=await prisma.purchaseOrder.findFirst({where:{id:input.poId,companyId:req.user.companyId},include:{items:true}});
  if(!po)return res.status(404).json({error:'PO not found'});
  const poMap=new Map(po.items.map(i=>[i.materialId,i]));
  for(const item of input.items){const line=poMap.get(item.materialId);if(!line)return res.status(400).json({error:'Material is not on PO'});if(item.receivedQty>Number(line.orderedQty)-Number(line.receivedQty))return res.status(400).json({error:'Received quantity exceeds PO balance'});}
  const number=`GRN-${new Date().getFullYear().toString().slice(-2)}-${Date.now().toString().slice(-7)}`;
  const grn=await prisma.$transaction(async tx=>{
    const created=await tx.gRN.create({data:{companyId:req.user.companyId,siteId:po.siteId,poId:po.id,number,status:'APPROVED',items:{create:input.items}},include:{items:true,po:true}});
    for(const item of input.items){
      await tx.pOItem.update({where:{id:poMap.get(item.materialId).id},data:{receivedQty:{increment:item.receivedQty}}});
      const accepted=item.receivedQty-item.rejectedQty;
      if(accepted>0){await tx.stock.upsert({where:{siteId_materialId:{siteId:po.siteId,materialId:item.materialId}},create:{siteId:po.siteId,materialId:item.materialId,quantity:accepted},update:{quantity:{increment:accepted}}});}
    }
    const lines=await tx.pOItem.findMany({where:{poId:po.id}}); const closed=lines.every(x=>Number(x.receivedQty)>=Number(x.orderedQty));
    await tx.purchaseOrder.update({where:{id:po.id},data:{status:closed?'CLOSED':'PARTIAL'}});
    return created;
  });
  res.status(201).json(grn);
}catch(err){next(err);}});
app.get('/api/grn',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.gRN.findMany({where:{companyId:req.user.companyId},include:{po:true,site:true,items:{include:{material:true}}},orderBy:{receivedAt:'desc'}}));}catch(err){next(err);}});

app.get('/api/stock',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.stock.findMany({where:{site:{companyId:req.user.companyId}},include:{site:true,material:true},orderBy:{site:{name:'asc'}}}));}catch(err){next(err);}});

const invoiceSchema=z.object({vendorId:z.string(),poId:z.string().optional(),number:z.string().min(1),invoiceDate:z.coerce.date(),dueDate:z.coerce.date().optional(),amount:z.coerce.number().positive()});
app.post('/api/invoices',auth,companyScope,role('ADMIN','ACCOUNTS'),async(req,res,next)=>{try{
  const input=invoiceSchema.parse(req.body);
  const vendor=await prisma.vendor.findFirst({where:{id:input.vendorId,companyId:req.user.companyId,active:true}}); if(!vendor)return res.status(400).json({error:'Invalid vendor'});
  if(input.poId){const po=await prisma.purchaseOrder.findFirst({where:{id:input.poId,companyId:req.user.companyId,vendorId:vendor.id}});if(!po)return res.status(400).json({error:'PO does not belong to vendor/company'});}
  const invoice=await prisma.invoice.create({data:{companyId:req.user.companyId,vendorId:vendor.id,poId:input.poId,number:input.number,invoiceDate:input.invoiceDate,dueDate:input.dueDate,amount:input.amount,status:'PENDING'},include:{vendor:true,po:true}});
  res.status(201).json(invoice);
}catch(err){next(err);}});
app.get('/api/invoices',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.invoice.findMany({where:{companyId:req.user.companyId},include:{vendor:true,po:true},orderBy:{dueDate:'asc'}}));}catch(err){next(err);}});

app.post('/api/approvals',auth,companyScope,async(req,res,next)=>{try{
  const input=z.object({entityType:z.string().min(2),entityId:z.string().min(1),status:z.enum(['PENDING','APPROVED','REJECTED']),comment:z.string().optional()}).parse(req.body);
  const approval=await prisma.approval.create({data:{entityType:input.entityType,entityId:input.entityId,userId:req.user.userId,status:input.status,comment:input.comment}});
  res.status(201).json(approval);
}catch(err){next(err);}});
app.get('/api/approvals',auth,companyScope,async(req,res,next)=>{try{res.json(await prisma.approval.findMany({where:{user:{companyId:req.user.companyId}},include:{user:{select:{id:true,name:true,email:true,role:true}}},orderBy:{createdAt:'desc'}}));}catch(err){next(err);}});

app.use((err,_req,res,_next)=>{ if(err?.name==='ZodError') return res.status(400).json({error:'Validation failed',details:err.issues}); console.error(err); res.status(500).json({error:'Internal server error'}); });
const port=Number(process.env.PORT||4000);
const server=app.listen(port,()=>console.log(`EzyProcure API listening on ${port}`));
process.on('SIGTERM',async()=>{server.close(async()=>{await prisma.$disconnect();process.exit(0);});});
