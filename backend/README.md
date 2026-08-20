# EzyProcure Backend

Production backend foundation for the procurement ERP.

## Architecture
- Node.js + Express API
- PostgreSQL via Prisma
- JWT authentication boundary
- Helmet/CORS validation
- Company-level data isolation

## Core data flow
Company → Sites → Materials/Vendors → PR → RFQ → Quotes → Approval → PO → GRN → Stock → Invoice/Payment

## Run locally
1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
2. `npm install`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm start`

Health: `GET /api/health`

The frontend must never receive the database credentials or OpenAI secret. Put secrets only in the cloud backend environment.
