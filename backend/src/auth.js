import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const registerSchema = z.object({
  companyName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  password: z.string().min(10).max(128),
  role: z.enum(['ADMIN','PROCUREMENT','SITE_STORE','ACCOUNTS','MANAGEMENT']).default('ADMIN')
});
const loginSchema = z.object({email:z.string().email(),password:z.string().min(1)});

const sign = user => jwt.sign(
  {sub:user.id, companyId:user.companyId, role:user.role, email:user.email, name:user.name},
  process.env.JWT_SECRET,
  {expiresIn:'12h'}
);

export function registerAuthRoutes(app, prisma){
  app.post('/api/auth/register', async (req,res,next)=>{
    try{
      const input=registerSchema.parse(req.body);
      const existing=await prisma.user.findUnique({where:{email:input.email.toLowerCase()}});
      if(existing) return res.status(409).json({error:'Email already registered'});
      const passwordHash=await bcrypt.hash(input.password,12);
      const company=await prisma.company.create({data:{name:input.companyName}});
      const user=await prisma.user.create({data:{companyId:company.id,name:input.name,email:input.email.toLowerCase(),passwordHash,role:input.role}});
      res.status(201).json({token:sign(user),user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.companyId,companyName:company.name}});
    }catch(err){next(err)}
  });

  app.post('/api/auth/login', async (req,res,next)=>{
    try{
      const input=loginSchema.parse(req.body);
      const user=await prisma.user.findUnique({where:{email:input.email.toLowerCase()},include:{company:true}});
      if(!user || !user.active || !(await bcrypt.compare(input.password,user.passwordHash))) return res.status(401).json({error:'Invalid email or password'});
      res.json({token:sign(user),user:{id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.companyId,companyName:user.company.name}});
    }catch(err){next(err)}
  });

  app.get('/api/auth/me', async (req,res)=>{
    const token=req.headers.authorization?.replace('Bearer ','');
    if(!token) return res.status(401).json({error:'Authentication required'});
    try{
      const payload=jwt.verify(token,process.env.JWT_SECRET);
      const user=await prisma.user.findUnique({where:{id:payload.sub},include:{company:true}});
      if(!user || !user.active) return res.status(401).json({error:'Account unavailable'});
      res.json({id:user.id,name:user.name,email:user.email,role:user.role,companyId:user.companyId,companyName:user.company.name});
    }catch{return res.status(401).json({error:'Invalid or expired token'})}
  });
}
