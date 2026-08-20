# EzyProcure Release Verification Plan

## 1. Platform
- Render API health: `/api/health` returns HTTP 200 and `database: connected`.
- PostgreSQL connection is supplied by managed Render database.
- Frontend points only to the production API base URL.

## 2. Authentication
- Admin login succeeds.
- Wrong password is rejected.
- Expired/invalid JWT is rejected.
- Department and role information is returned with the session.

## 3. Authorization matrix
- ADMIN: all modules.
- PROCUREMENT: procurement workflows only.
- ACCOUNTS: invoices, payments, expenses and relevant reports.
- HR: employees and attendance/workforce records.
- SITE_ENGINEER: site execution workflows.
- SITE_STORE: store/inventory receiving and material workflows.
- MANAGEMENT: cross-department reporting and approvals.
- Every restricted API endpoint must return HTTP 403.

## 4. Procurement transaction chain
- Create site.
- Raise PR.
- Create RFQ from PR.
- Add supplier quotation.
- Create PO.
- Receive GRN.
- Verify PO received quantity.
- Verify stock increase at the correct site.

## 5. Site execution
- Create MRN for a site.
- Track MRN status.
- Create site task.
- Assign task to responsible person.
- Record labour attendance against the correct site.
- Verify site stock remains company/site scoped.

## 6. Accounts
- Record vendor invoice.
- Record payment against invoice.
- Record site/company expense.
- Verify management dashboard totals.

## 7. HR
- Create employee.
- Assign department.
- Record employee attendance.
- Create labour master.
- Record labour attendance.

## 8. Audit and safety
- Protected create/update actions generate audit records.
- No production secrets are committed to Git.
- Demo credentials are replaced before real-world production use.
- Database credentials are rotated after any accidental exposure.

## 9. Browser verification
- Login page loads from GitHub Pages.
- API status becomes Online/Connected.
- Dashboard renders without console-blocking failures.
- Each authorized navigation item opens successfully.
- Mobile layout remains usable.
