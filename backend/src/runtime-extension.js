// Runtime extension for the advanced EzyProcure server.
// This file is injected into the same module scope by runtime-bootstrap.mjs.

const approvalEntities = {
  PR: { model: 'purchaseRequisition', label: 'Purchase Requisition' },
  RFQ: { model: 'rFQ', label: 'RFQ' },
  PO: { model: 'purchaseOrder', label: 'Purchase Order' },
  GRN: { model: 'gRN', label: 'GRN' },
  MRN: { model: 'mRN', label: 'MRN' },
  INVOICE: { model: 'invoice', label: 'Invoice' },
  EXPENSE: { model: 'expense', label: 'Expense' },
  TASK: { model: 'siteTask', label: 'Site Task' }
};

const entityFor = value => approvalEntities[String(value || '').toUpperCase()];

app.get('/api/audit', auth, companyScope, role('ADMIN','MANAGEMENT'), async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { companyId: req.user.companyId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(req.query.limit || 250), 1), 1000)
    });
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/approvals', auth, companyScope, role('ADMIN','MANAGEMENT','ACCOUNTS','PROCUREMENT'), async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const rows = await prisma.approval.findMany({
      where: { status: status || undefined, user: { companyId: req.user.companyId } },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500
    });
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/api/approvals', auth, companyScope, role('ADMIN','MANAGEMENT','ACCOUNTS','PROCUREMENT'), async (req, res, next) => {
  try {
    const x = z.object({ entityType: z.string().min(2), entityId: z.string().min(1), comment: z.string().max(2000).optional() }).parse(req.body);
    const entity = entityFor(x.entityType);
    if (!entity) return res.status(400).json({ error: 'Unsupported approval entity type' });
    const record = await prisma[entity.model].findFirst({ where: { id: x.entityId, companyId: req.user.companyId } });
    if (!record) return res.status(404).json({ error: `${entity.label} not found` });
    const existing = await prisma.approval.findFirst({ where: { entityType: String(x.entityType).toUpperCase(), entityId: x.entityId, status: 'PENDING' } });
    if (existing) return res.status(409).json({ error: 'A pending approval already exists for this record', approval: existing });
    const approval = await prisma.approval.create({ data: { entityType: String(x.entityType).toUpperCase(), entityId: x.entityId, userId: req.user.userId, comment: x.comment || null, status: 'PENDING' }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
    await audit(req, 'APPROVAL_REQUESTED', entity.label, x.entityId, record, approval);
    res.status(201).json(approval);
  } catch (e) { next(e); }
});

app.patch('/api/approvals/:id', auth, companyScope, role('ADMIN','MANAGEMENT','ACCOUNTS','PROCUREMENT'), async (req, res, next) => {
  try {
    const x = z.object({ status: z.enum(['APPROVED','REJECTED']), comment: z.string().max(2000).optional() }).parse(req.body);
    const approval = await prisma.approval.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!approval || approval.user.companyId !== req.user.companyId) return res.status(404).json({ error: 'Approval not found' });
    if (approval.status !== 'PENDING') return res.status(409).json({ error: 'Approval is already closed' });
    if (x.status === 'REJECTED' && !x.comment?.trim()) return res.status(400).json({ error: 'Rejection comment is required' });
    const entity = entityFor(approval.entityType);
    if (!entity) return res.status(400).json({ error: 'Unsupported approval entity type' });
    const record = await prisma[entity.model].findFirst({ where: { id: approval.entityId, companyId: req.user.companyId } });
    if (!record) return res.status(404).json({ error: `${entity.label} not found` });

    const nextStatus = x.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.approval.update({ where: { id: approval.id }, data: { status: x.status, comment: x.comment?.trim() || approval.comment || null }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
      const entityUpdated = await tx[entity.model].update({ where: { id: record.id }, data: { status: nextStatus } });
      return { approval: updated, entity: entityUpdated };
    });
    await audit(req, x.status === 'APPROVED' ? 'APPROVED' : 'REJECTED', entity.label, record.id, record, result.entity);
    res.json(result);
  } catch (e) { next(e); }
});

app.get('/api/approvals/:entityType/:entityId', auth, companyScope, role('ADMIN','MANAGEMENT','ACCOUNTS','PROCUREMENT'), async (req, res, next) => {
  try {
    const entity = entityFor(req.params.entityType);
    if (!entity) return res.status(400).json({ error: 'Unsupported approval entity type' });
    const record = await prisma[entity.model].findFirst({ where: { id: req.params.entityId, companyId: req.user.companyId } });
    if (!record) return res.status(404).json({ error: `${entity.label} not found` });
    const rows = await prisma.approval.findMany({ where: { entityType: String(req.params.entityType).toUpperCase(), entityId: req.params.entityId }, include: { user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ entity: record, approvals: rows });
  } catch (e) { next(e); }
});

app.get('/api/control-center', auth, companyScope, role('ADMIN','MANAGEMENT'), async (req, res, next) => {
  try {
    const c = req.user.companyId;
    const [pendingApprovals, auditCount, users, vendors, employees, prs, pos, grns, mrns, invoices] = await Promise.all([
      prisma.approval.count({ where: { status: 'PENDING', user: { companyId: c } } }),
      prisma.auditLog.count({ where: { companyId: c } }),
      prisma.user.count({ where: { companyId: c, active: true } }),
      prisma.vendor.count({ where: { companyId: c, active: true } }),
      prisma.employee.count({ where: { companyId: c, active: true } }),
      prisma.purchaseRequisition.count({ where: { companyId: c } }),
      prisma.purchaseOrder.count({ where: { companyId: c } }),
      prisma.gRN.count({ where: { companyId: c } }),
      prisma.mRN.count({ where: { companyId: c } }),
      prisma.invoice.count({ where: { companyId: c } })
    ]);
    res.json({ pendingApprovals, auditCount, users, vendors, employees, prs, pos, grns, mrns, invoices, generatedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});
