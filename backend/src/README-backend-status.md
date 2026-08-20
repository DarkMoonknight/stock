# EzyProcure Backend — Completion & QA Contract

## Production workflow

`Login → PR → RFQ → Quote → PO → GRN → Stock → Invoice → Approval → Reporting`

## Security contract

- JWT authentication is required for protected APIs.
- Every protected request carries `companyId` in the signed token and is scoped to that company.
- Role checks protect write operations.
- Helmet and strict CORS are enabled.
- Secrets are environment variables; never commit `.env` or API keys.

## Data contract

PostgreSQL/Prisma is the source of truth. Core entities include Company, User, Site, Material, Vendor, PR, RFQ, Quote, PO, GRN, Stock, Invoice, Approval and AuditLog.

## Internationalization foundation

Company country, base currency and timezone are stored. Vendors, quotes, purchase orders and invoices carry currency/exchange-rate fields so the application can support multi-country procurement without redesigning the core model.

## Deployment checks

Before declaring production-ready, verify:

1. `/api/health` returns database `connected`.
2. Admin login returns a JWT.
3. Create PR and retrieve it.
4. Create RFQ against the PR and invite only same-company vendors.
5. Submit at least two quotes and verify comparison ordering.
6. Create PO and verify totals.
7. Create GRN and verify PO received quantity and stock transactionally update.
8. Create invoice and verify PO/vendor scope.
9. Verify unauthorized and cross-company requests are rejected.
10. Verify audit events and backup/restore procedure in the deployed environment.

These are release gates; a UI preview is not considered a production backend test.
