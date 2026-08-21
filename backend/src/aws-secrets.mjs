import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const SECRET_ID = process.env.AWS_SECRETS_MANAGER_SECRET_ID?.trim();
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';

function addRdsTls(databaseUrl) {
  if (!databaseUrl || process.env.AWS_RDS_SSL !== 'true') return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

export async function loadAwsSecrets() {
  if (!SECRET_ID) return { enabled: false, loaded: false, provider: 'environment' };

  const client = new SecretsManagerClient({ region: AWS_REGION });
  const response = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const raw = response.SecretString ?? (response.SecretBinary ? Buffer.from(response.SecretBinary).toString('utf8') : '');
  if (!raw) throw new Error(`AWS secret ${SECRET_ID} returned no secret value`);

  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    values = { DATABASE_URL: raw };
  }

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('AWS secret must be a JSON object or a raw DATABASE_URL string');
  }

  const allowedKeys = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'DEMO_ADMIN_EMAIL',
    'DEMO_ADMIN_PASSWORD',
    'OPENAI_API_KEY'
  ];
  const override = process.env.AWS_SECRETS_OVERRIDE !== 'false';

  for (const key of allowedKeys) {
    const value = values[key];
    if (typeof value === 'string' && value.length > 0 && (override || !process.env[key])) {
      process.env[key] = value;
    }
  }

  process.env.DATABASE_URL = addRdsTls(process.env.DATABASE_URL);
  return { enabled: true, loaded: true, provider: 'aws-secrets-manager', region: AWS_REGION };
}
