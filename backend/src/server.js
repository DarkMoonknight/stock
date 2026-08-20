import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') ?? '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));

const auth = (req,res,next) => {
  const token = req.headers.authorization?.replace('Bearer ','');
  if (!token) return res.status(401).json({error:'Authentication required'});
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({error:'Invalid or expired token'}); }
};
const companyScope = (req,res,next) => { if (!req.user?.companyId) return res.status(403).json({error:'Company scope missing'}); next(); };

app.get('/', (_req,res) => res.json({ok:true, service:'ezyprocure-api', status:'online'}));
app.get('/health', async (_req,res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ok:true, service:'ezyprocure-api', database:'connected'}); }
  catch { res.status(503).json({ok:false, service:'ezyprocure-api', database:'unavailable'}); }
});
app.get('/api/health', async (_req,res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ok:true, service:'ezyprocure-api', database:'connected'}); }
  catch { res.status(503).json({ok:false, service:'ezyprocure-api', database:'unavailable'}); }
});

app.get('/api/dashboard', auth, companyScope, async (req,res) => {
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
});

app.get('/api/materials', auth, companyScope, async (req,res)=>res.json(await prisma.material.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}})));
app.get('/api/vendors', auth, companyScope, async (req,res)=>res.json(await prisma.vendor.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}})));
app.get('/api/sites', auth, companyScope, async (req,res)=>res.json(await prisma.site.findMany({where:{companyId:req.user.companyId,active:true},orderBy:{name:'asc'}})));

const prSchema=z.object({siteId:z.string(),requestedBy:z.string().min(1),requiredDate:z.coerce.date(),notes:z.string().optional(),items:z.array(z.object({materialId:z.string(),quantity:z.coerce.number().positive(),estimatedRate:z.coerce.number().nonnegative().optional()})).min(1)});
app.post('/api/pr',auth,companyScope,async(req,res)=>{
  const input=prSchema.parse(req.body);
  const number=`PR-${new Date().getFullYear().toString().slice(-2)}-${Date.now().toString().slice(-7)}`;
  const pr=await prisma.purchaseRequisition.create({data:{companyId:req.user.companyId,siteId:input.siteId,number,requestedBy:input.requestedBy,requiredDate:input.requiredDate,notes:input.notes,status:'PENDING',items:{create:input.items}} ,include:{items:true}});
  res.status(201).json(pr);
});

app.get('/api/pr',auth,companyScope,async(req,res)=>res.json(await prisma.purchaseRequisition.findMany({where:{companyId:req.user.companyId},include:{items:{include:{material:true}},site:true},orderBy:{createdAt:'desc'}})));
app.get('/api/rfq',auth,companyScope,async(req,res)=>res.json(await prisma.rFQ.findMany({where:{companyId:req.user.companyId},include:{pr:true,vendors:{include:{vendor:true}},quotes:true},orderBy:{dueDate:'asc'}})));
app.get('/api/po',auth,companyScope,async(req,res)=>res.json(await prisma.purchaseOrder.findMany({where:{companyId:req.user.companyId},include:{vendor:true,site:true,items:{include:{material:true}}},orderBy:{orderDate:'desc'}})));
app.get('/api/grn',auth,companyScope,async(req,res)=>res.json(await prisma.gRN.findMany({where:{companyId:req.user.companyId},include:{po:true,site:true,items:{include:{material:true}}},orderBy:{receivedAt:'desc'}})));
app.get('/api/invoices',auth,companyScope,async(req,res)=>res.json(await prisma.invoice.findMany({where:{companyId:req.user.companyId},include:{vendor:true,po:true},orderBy:{dueDate:'asc'}})));

app.use((err,_req,res,_next)=>{ if(err?.name==='ZodError') return res.status(400).json({error:'Validation failed',details:err.issues}); console.error(err); res.status(500).json({error:'Internal server error'}); });
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`EzyProcure API listening on ${port}`));
