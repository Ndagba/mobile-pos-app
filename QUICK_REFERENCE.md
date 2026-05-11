# Mobile POS - Quick Reference Guide

## Start Here (First Time)

```bash
# 1. Backend
cd backend && npm install
cp .env.example .env
docker-compose up -d postgres redis
npm run migrate && npm run seed
npm run dev  # Port 3000

# 2. Mobile
cd mobile && npm install
npm start    # Scan QR with Expo Go

# 3. Done! Test at http://localhost:3000/health
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | System design, tech stack, database schema |
| `IMPLEMENTATION_GUIDE.md` | Setup, workflows, API examples |
| `backend/src/index.ts` | Express server entry point |
| `mobile/src/App.tsx` | React Native app root |
| `backend/prisma/schema.prisma` | Database schema (Prisma) |
| `mobile/src/redux/store.ts` | Redux setup |
| `mobile/src/services/SyncManager.ts` | Offline sync logic |

---

## Critical Concepts

### Offline Session Hash
```typescript
// Ensures idempotency in offline transactions
offline_session_hash = SHA256(deviceId + transactionId + timestamp)

// On sync, server checks if hash exists
// If yes: Return cached result (prevents duplicates)
// If no: Create new transaction
```

### Redux State Flow
```
Component dispatches action
  ↓
Reducer updates state
  ↓
syncMiddleware watches for sync actions
  ↓
Calls SyncManager to batch sync
  ↓
Redux state reflects sync status
```

### API Response Format
```json
{
  "status": "success|error",
  "data": { /* actual payload */ },
  "pagination": { "limit": 50, "offset": 0, "total": 100 }
}
```

### Error Format
```json
{
  "status": "error",
  "message": "User description of error",
  "details": { /* dev-only in development */ }
}
```

---

## Common Commands

### Backend
```bash
npm run dev              # Development server (watch mode)
npm run build          # Compile TypeScript
npm run start          # Production server
npm run migrate        # Run database migrations
npm run seed           # Seed sample data
npm test               # Run tests
npm run lint           # Check code style
```

### Mobile
```bash
npm start              # Start Expo
npm run android        # Run on Android emulator
npm run ios            # Run on iOS simulator
npm test               # Run tests
npm run build          # Build for deployment
```

### Docker
```bash
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker logs mobilepos_api     # View logs
docker exec mobilepos_api npm run migrate  # Run inside container
```

---

## Database Essentials

### Quick Queries

```sql
-- List all transactions today
SELECT * FROM transactions 
WHERE created_at::date = CURRENT_DATE
ORDER BY created_at DESC;

-- Find low-stock items
SELECT p.name, i.quantity_on_hand, i.low_stock_threshold
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE i.quantity_on_hand <= i.low_stock_threshold;

-- Pending offline sync
SELECT * FROM offline_sync_queue
WHERE status = 'pending'
ORDER BY created_at ASC;

-- Daily revenue
SELECT DATE(created_at), SUM(total_amount), COUNT(*) as transactions
FROM transactions
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY DATE DESC;

-- Top products
SELECT p.name, SUM(ti.quantity) as qty_sold, SUM(ti.line_total) as revenue
FROM transaction_items ti
JOIN products p ON ti.product_id = p.id
GROUP BY p.id, p.name
ORDER BY revenue DESC
LIMIT 10;
```

### Useful pgAdmin Queries

```
Server: localhost:5432
User: pos_user
Password: secure_password (from docker-compose.yml)
URL: http://localhost:5050
```

---

## API Testing Examples

### Test with cURL

```bash
# Biometric login
curl -X POST http://localhost:3000/v1/auth/biometric-verify \
  -H "Content-Type: application/json" \
  -d '{
    "biometric_token_hash": "test_hash",
    "device_id": "device_123"
  }'

# Create transaction
curl -X POST http://localhost:3000/v1/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "store_001",
    "user_id": "user_123",
    "offline_session_hash": "hash_123",
    "subtotal": 900,
    "tax_amount": 100,
    "discount_amount": 0,
    "total_amount": 1000,
    "payment_method": "cash",
    "items": [
      {
        "product_id": "prod_1",
        "quantity": 2,
        "unit_price": 450,
        "tax_amount": 100,
        "line_total": 1000
      }
    ]
  }'

# Get products
curl -X GET 'http://localhost:3000/v1/products?limit=10&offset=0' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test with Postman

1. Import collection: `backend/postman_collection.json`
2. Set environment variable: `baseUrl = http://localhost:3000/v1`
3. Get access token from `/auth/biometric-verify`
4. Set `{{token}}` in Authorization header
5. Run requests

---

## Redux Actions Quick Reference

### Auth
```typescript
dispatch(loginSuccess({ user, access_token, refresh_token, device_id }))
dispatch(logout())
dispatch(enableBiometric({ device_id }))
```

### Cart
```typescript
dispatch(addItem(cartItem))
dispatch(removeItem(productId))
dispatch(updateQuantity({ product_id, quantity }))
dispatch(setPaymentMethod('cash'))
dispatch(setDiscount(100))
dispatch(clearCart())
```

### Inventory
```typescript
dispatch(setProducts(products))
dispatch(setInventory(items))
dispatch(setSearchQuery('widget'))
dispatch(setLowStockAlerts(alerts))
```

### Sync
```typescript
dispatch(setSyncMode('OFFLINE'))
dispatch(setConnected(false))
dispatch(addToSyncQueue(item))
dispatch(setLastSyncAt(timestamp))
```

---

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://pos_user:password@localhost:5432/mobilepos
PORT=3000
NODE_ENV=development
JWT_SECRET=your_secret_key
REFRESH_TOKEN_SECRET=your_refresh_secret
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
```

### Mobile (.env)
```
EXPO_PUBLIC_API_URL=http://localhost:3000/v1
EXPO_PUBLIC_LOG_LEVEL=info
```

---

## Debugging Tips

### Mobile
```javascript
// Redux DevTools
import ReduxDevTools from '@react-native-debugger/redux-devtools';

// Realm Database Inspector
realm.writeTransaction(() => {
  console.log(realm.objects('Transaction'));
});

// Network Debugging
ApiClient.setOnlineStatus(false);  // Simulate offline
```

### Backend
```typescript
// Enable query logging
prisma.$on('query', (e) => {
  console.log(e);  // See all DB queries
});

// Logger usage
logger.info({ event: 'transaction_created', ... });
logger.error({ event: 'error', error: err.message });
```

### Database
```sql
-- Enable query logging
SET log_statement = 'all';

-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
```

---

## Common Errors & Fixes

### "Network error"
- Check if backend is running: `curl http://localhost:3000/health`
- Check if mobile can reach backend IP
- For Android emulator: Use `10.0.2.2:3000` instead of `localhost`

### "Biometric not available"
- Enroll fingerprint/Face ID in device settings
- Check `Biometrics.hasHardwareAsync()` returns true

### "Transaction not syncing"
- Check `ApiClient.getOnlineStatus()` reflects true connection state
- Check offline_sync_queue table: `SELECT * FROM offline_sync_queue`
- Verify offline_session_hash format

### "Database locked"
- Restart container: `docker-compose restart postgres`
- Check for long-running transactions: `SELECT * FROM pg_stat_activity`

### "Permission denied" on Docker
- Add user to docker group: `sudo usermod -aG docker $USER`
- Or use sudo: `sudo docker-compose up`

---

## Performance Optimization Checklist

- [ ] Enable database indexes: `CREATE INDEX idx_field ON table(field)`
- [ ] Use Redis for catalog caching
- [ ] Implement query pagination (limit 50-100)
- [ ] Memoize expensive components
- [ ] Use virtual scrolling for lists > 100 items
- [ ] Cache API responses locally
- [ ] Batch offline transactions (10-50 per request)
- [ ] Compress images with Sharp
- [ ] Code split by route

---

## Security Checklist

- [ ] Enable HTTPS in production
- [ ] Rotate JWT secret every 30 days
- [ ] Enable rate limiting (5 login attempts → 30 min lockout)
- [ ] Check device root/jailbreak status
- [ ] Use EncryptedSharedPreferences for sensitive data
- [ ] Implement certificate pinning
- [ ] Mask PAN in receipts: "****-****-****-4242"
- [ ] Log all void/admin actions
- [ ] Test with OWASP Top 10

---

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use managed PostgreSQL (not Docker)
- [ ] Enable Redis persistence
- [ ] Configure backups (daily snapshots)
- [ ] Set up monitoring (Sentry, DataDog)
- [ ] Enable HTTPS/TLS 1.3+
- [ ] Configure rate limiting
- [ ] Test rollback procedure
- [ ] Set up CI/CD pipeline

---

## Testing Checklist

- [ ] Test offline transaction flow
- [ ] Test inventory deduction
- [ ] Test low-stock alerts
- [ ] Test biometric login
- [ ] Test payment methods
- [ ] Test receipt generation
- [ ] Test analytics queries
- [ ] Load test with 100+ concurrent users
- [ ] Test on multiple devices/OS versions

---

## Resources

- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Prisma Docs**: https://www.prisma.io/docs/
- **React Native**: https://reactnative.dev/
- **Redux Toolkit**: https://redux-toolkit.js.org/
- **Material Design 3**: https://m3.material.io/

---

## Key Contacts

- **Tech Lead**: [Your Name]
- **Product Manager**: [Your Name]
- **DevOps**: [Your Name]
- **Security**: [Your Name]

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0 MVP
**Status**: Production Ready ✅
