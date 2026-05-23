\# Deployment Guide



\## Pre-deployment Checklist



\- \[ ] All tests passing (57 backend, 4 mobile)

\- \[ ] No console errors in mobile

\- \[ ] No unhandled exceptions in logs

\- \[ ] Performance benchmarks met

\- \[ ] Security audit passed

\- \[ ] Database migrations reviewed

\- \[ ] Environment variables configured

\- \[ ] Backups scheduled

\- \[ ] Monitoring setup



\## Environment Variables (Production)



```env

DATABASE\_URL=postgresql://pos\_user:<strong\_password>@<db\_host>:5432/mobilepos

NODE\_ENV=production

JWT\_SECRET=<openssl rand -base64 32>

REFRESH\_TOKEN\_SECRET=<openssl rand -base64 32>

REDIS\_URL=redis://<redis\_host>:6379

PORT=3000

```



\## Staging Deployment



\### 1. Build Backend

```bash

cd backend

npm run build

docker build -t mobile-pos:staging .

```



\### 2. Run Migrations

```bash

docker-compose exec api npx prisma migrate deploy

```



\### 3. Seed Minimal Data

```bash

cd backend

npx prisma db seed

```



\### 4. Build Mobile App

```bash

cd mobile

eas build --platform android --release

```



\### 5. Smoke Tests

```bash

cd backend

npx jest tests/integration/checkout-flow.test.ts

```



\## Production Deployment



\### 1. Backup Database First

```powershell

.\\backend\\scripts\\backup-db.ps1

```



\### 2. Deploy

```bash

docker-compose up -d --build

docker-compose exec api npx prisma migrate deploy

```



\### 3. Verify

```bash

curl http://localhost:3000/health

npx jest tests/integration/complete-checkout.test.ts

```



\### 4. Rollback Plan

```bash

\# Revert to previous image

docker-compose down

docker tag mobile-pos:previous mobile-pos:latest

docker-compose up -d

```



\## Key URLs

\- API: http://localhost:3000

\- pgAdmin: http://localhost:5050

\- Health check: http://localhost:3000/health

