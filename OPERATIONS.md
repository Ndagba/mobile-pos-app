\# Operations Runbook



\## Daily Checks



\### Morning (Before business hours)

```powershell

\# Check system health

curl http://localhost:3000/health



\# Check all containers running

docker-compose ps



\# Check API logs for errors

docker-compose logs api --tail=50 | Select-String "ERROR"

```



\### Evening (After business hours)

```powershell

\# Backup database

.\\backend\\scripts\\backup-db.ps1



\# Check pending sync queue

\# Run in pgAdmin:

\# SELECT COUNT(\*) FROM "OfflineSyncQueue" WHERE status = 'pending';

```



\## Troubleshooting



\### API not responding

1\. Check container: `docker-compose ps`

2\. Check logs: `docker-compose logs api --tail=20`

3\. Restart: `docker-compose restart api`



\### Database connection failed

1\. Check postgres: `docker-compose ps postgres`

2\. Restart: `docker-compose restart postgres`

3\. Verify connection: check pgAdmin at http://localhost:5050



\### High sync queue

1\. Check queue in pgAdmin:

&#x20;  `SELECT COUNT(\*) FROM "OfflineSyncQueue" WHERE status = 'pending';`

2\. Manual retry: `POST /v1/sync/retry/<queueId>`



\### Rate limit triggered unexpectedly

1\. Check logs: `docker-compose logs api | Select-String "429"`

2\. Restart API to reset: `docker-compose restart api`



\### Database locked / slow queries

1\. Check active connections in pgAdmin:

&#x20;  `SELECT \* FROM pg\_stat\_activity;`

2\. Kill long-running query:

&#x20;  `SELECT pg\_terminate\_backend(pid) FROM pg\_stat\_activity WHERE duration > interval '5 minutes';`



\## Incidents



\### Data Loss

1\. Restore from backup: run backup SQL file in pgAdmin

2\. Verify: `SELECT COUNT(\*) FROM "Transaction";`

3\. Notify users if needed



\### Security Breach

1\. Rotate JWT secrets in docker-compose.yml

2\. Restart API: `docker-compose restart api`

3\. Review audit logs in pgAdmin:

&#x20;  `SELECT \* FROM "AuditLog" ORDER BY created\_at DESC LIMIT 100;`



\## Test Commands

```powershell

\# Full backend test suite

cd backend

npx jest --coverage



\# Security tests only

npx jest tests/security/auth.security.test.ts



\# Integration tests only

npx jest tests/integration/

```

