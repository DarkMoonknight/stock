# EzyProcure AWS backend target

The backend is PostgreSQL/Prisma based and is being kept deployable on AWS without making AWS mandatory for local development.

## Target architecture

- **Compute:** AWS App Runner for the first managed deployment, or ECS/Fargate when private networking and finer control are required.
- **Database:** Amazon RDS for PostgreSQL in private subnets.
- **Secrets:** AWS Secrets Manager. The application supports `AWS_SECRETS_MANAGER_SECRET_ID` and loads the secret before Prisma is initialized.
- **Network:** RDS security group should allow PostgreSQL (5432) only from the application security boundary. Do not open 5432 to `0.0.0.0/0`.
- **TLS:** Set `AWS_RDS_SSL=true`; the backend adds `sslmode=require` to the PostgreSQL URL when it is missing.
- **Region:** `ap-south-1` (Mumbai) is the application/default region currently being used. The AWS Agent Toolkit itself is configured in `us-east-1` per AWS's current setup instructions.
- **Frontend:** `https://vaquitecalifornia.com` and `https://www.vaquitecalifornia.com`.

## Secrets Manager payload

Store a JSON object in the secret referenced by `AWS_SECRETS_MANAGER_SECRET_ID`:

```json
{
  "DATABASE_URL": "postgresql://app_user:REDACTED@RDS_ENDPOINT:5432/ezyprocure?schema=public",
  "JWT_SECRET": "REDACTED",
  "JWT_EXPIRES_IN": "12h",
  "DEMO_ADMIN_EMAIL": "admin@ezyprocure.local",
  "DEMO_ADMIN_PASSWORD": "REDACTED",
  "OPENAI_API_KEY": "REDACTED"
}
```

Never commit this JSON with real values.

## Runtime behavior

`src/runtime-bootstrap.mjs` loads Secrets Manager first, then builds the combined Express runtime. This matters because `server.js` constructs Prisma and JWT configuration at startup; secrets must therefore be available before the server module is imported.

If no secret id is configured, local/Render environments continue using normal environment variables.

## Deployment requirements

1. Application role/instance role can read only the named Secrets Manager secret (`secretsmanager:GetSecretValue`; include `kms:Decrypt` only when the secret uses a customer-managed KMS key).
2. RDS is not publicly reachable for production.
3. Use a dedicated database user for the application, not the RDS master user.
4. Run `prisma migrate deploy` for production schema changes rather than relying on `prisma db push`.
5. Run backend contract tests before deployment.
6. Use CloudWatch/Application logs and health checks for runtime monitoring.

The current Render deployment remains supported while AWS infrastructure is being prepared; this change does not require an AWS secret to exist yet.
