# EzyProcure Enterprise Blueprint

## Product model
EzyProcure is a cloud-first, multi-department, multi-site operating platform. The Owner/Admin role is the system superuser; department roles receive least-privilege access enforced by the API.

## Core departments

| Role | Main scope | Primary workflows |
| --- | --- | --- |
| ADMIN | Full company control | Users, departments, approvals, audit, all modules |
| MANAGEMENT | Cross-company visibility | Dashboard, reports, approvals, sites, procurement, accounts, HR |
| PROCUREMENT | Purchasing | PR, RFQ, quotations, PO, vendors, materials |
| ACCOUNTS | Finance | Invoices, payments, expenses, financial reports |
| HR | People | Employees, attendance, labour master, workforce reports |
| SITE_ENGINEER | Site execution | Sites, tasks, MRN, GRN, stock, labour attendance |
| SITE_STORE | Store operations | Materials, MRN, GRN, stock, labour attendance |

## End-to-end site flow

Site creation → Material Request (MRN) → Purchase Requisition (PR) → RFQ → Supplier Quotations → PO → GRN → Stock → Material issue/consumption → Site tasks → Labour attendance → Cost and finance reporting.

## Finance flow

Vendor → PO → Invoice → Payment → Expense/cost visibility → Management reporting.

## People flow

Employee master → Department assignment → Attendance → workforce reporting.

Labour master → Site assignment → Labour attendance → site workforce reporting.

## Security

- JWT authentication.
- Company-level tenant isolation.
- Role/department authorization at API layer.
- Audit log on important create/update operations.
- Admin-only controls for system administration.

## Cloud deployment

- Frontend: GitHub Pages deployment pipeline.
- API: Render web service.
- Database: Render PostgreSQL.
- Secrets: Render environment variables only; no production secrets committed to Git.

## Release gate

A production release is considered complete only after:

1. Prisma schema validation passes.
2. Backend contract tests pass.
3. Render health endpoint reports `database: connected`.
4. Login works from the published frontend.
5. Owner/Admin can access all modules.
6. Department roles are denied from unrelated workflows.
7. PR → RFQ → Quote → PO → GRN → Stock flow is verified.
8. Site Engineer MRN, tasks and labour attendance flow is verified.
9. Accounts invoice/payment/expense flow is verified.
10. Audit log records protected actions.
