# Mobile POS System - Complete Implementation Guide

## Quick Start (5-10 minutes)

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Start PostgreSQL and Redis (using Docker)
docker-compose up -d postgres redis

# Run migrations
npm run migrate

# Seed initial data
npm run seed

# Start development server
npm run dev
# Server runs on http://localhost:3000
```

### 2. Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo
npm start

# Run on Android or iOS emulator
# Or scan QR code with Expo Go app
```

### 3. Test the Complete Flow

**Backend is running:** http://localhost:3000/health should return `{"status":"ok"}`

**Mobile app is running:** You should see the login screen

---

## Architecture Deep Dive

### Backend Architecture

```
┌─────────────────────────────────────────┐
│   Express.js API Server (Port 3000)    │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │   Route Handlers (REST API)     │   │
│  │  ├── /auth                      │   │
│  │  ├── /transactions              │   │
│  │  ├── /products                  │   │
│  │  ├── /inventory                 │   │
│  │  ├── /customers                 │   │
│  │  └── /analytics                 │   │
│  └─────────────────────────────────┘   │
│           ↓                             │
│  ┌─────────────────────────────────┐   │
│  │  Service Layer (Business Logic) │   │
│  │  ├── AuthService                │   │
│  │  ├── TransactionService         │   │
│  │  ├── InventoryService           │   │
│  │  └── AnalyticsService           │   │
│  └─────────────────────────────────┘   │
│           ↓                             │
│  ┌─────────────────────────────────┐   │
│  │   Prisma ORM + Middleware       │   │
│  │  ├── Authentication             │   │
│  │  ├── Error Handling             │   │
│  │  └── Logging                    │   │
│  └─────────────────────────────────┘   │
│           ↓                             │
└─────────────────────────────────────────┘
         ↓
    PostgreSQL Database
    (Single source of truth)
```

**Key Features:**
- ✅ Biometric authentication verification
- ✅ Offline transaction sync (idempotent via offline_session_hash)
- ✅ Real-time inventory tracking
- ✅ Audit logging for compliance
- ✅ Multi-user with role-based access

### Mobile Architecture

```
┌──────────────────────────────────────┐
│    React Native (UI Layer)           │
│  ┌────────────────────────────────┐  │
│  │  Screens                       │  │
│  │  ├── Auth (Biometric)         │  │
│  │  ├── Dashboard (Analytics)    │  │
│  │  ├── Checkout (POS)           │  │
│  │  ├── Inventory Management     │  │
│  │  └── Settings                 │  │
│  └────────────────────────────────┘  │
│           ↓                           │
│  ┌────────────────────────────────┐  │
│  │  Redux Store (State Mgmt)      │  │
│  │  ├── auth                      │  │
│  │  ├── cart                      │  │
│  │  ├── inventory                 │  │
│  │  ├── sync                      │  │
│  │  └── ui                        │  │
│  └────────────────────────────────┘  │
│           ↓                           │
│  ┌────────────────────────────────┐  │
│  │  Service Layer                 │  │
│  │  ├── ApiClient (offline-first) │  │
│  │  ├── SyncManager               │  │
│  │  ├── TransactionService        │  │
│  │  └── DatabaseService           │  │
│  └────────────────────────────────┘  │
│           ↓                           │
└──────────────────────────────────────┘
         ↓
    Local SQLite (Realm)
    Offline transactions
         ↓
    Network (when available)
         ↓
    Backend API
```

**Key Features:**
- ✅ Offline-first architecture
- ✅ Automatic sync when connection restored
- ✅ Biometric-based login
- ✅ Real-time product search (Fuse.js)
- ✅ Material Design 3 UI

---

## Core Workflows

### 1. Online Checkout Flow

```
User Biometric Login
    ↓
Auth Service validates with backend
    ↓
JWT tokens stored securely
    ↓
Checkout Screen opens
    ↓
User adds items to cart
    ↓
Select payment method
    ↓
POST /transactions (online)
    ↓
Backend creates transaction, updates inventory
    ↓
Receipt generated
    ↓
Cart cleared, ready for next sale
```

### 2. Offline → Online Sync Flow

```
User creates transaction while offline
    ↓
Generate offline_session_hash: SHA256(deviceId + txId + timestamp)
    ↓
Store in local Realm database
    ↓
Transaction marked: is_sync_online = false
    ↓
Add to SyncQueue
    ↓
[Network comes back online]
    ↓
SyncManager detects connection
    ↓
Batch fetch all pending transactions
    ↓
POST /transactions/batch with array of transactions
    ↓
Backend deduplicates by offline_session_hash (idempotent)
    ↓
Update sync status in local DB: is_sync_online = true
    ↓
Update inventory in background
```

### 3. Inventory Low-Stock Alert Flow

```
Every 5 minutes (background):
    ↓
GET /inventory/low-stock
    ↓
Filter items: quantity_on_hand ≤ low_stock_threshold
    ↓
Local notification if threshold exceeded
    ↓
Display in-app alert badge
    ↓
Manager receives notification
    ↓
Can trigger reorder workflow
```

### 4. Analytics Dashboard Flow

```
Dashboard Screen loads
    ↓
GET /analytics/dashboard (today's metrics)
    ↓
Get /inventory/low-stock (alerts)
    ↓
Parallel requests for performance
    ↓
Redux store updates
    ↓
Charts render with real-time data
    ↓
Background refresh every 30 seconds
```

---

## Database Operations

### Creating a Transaction (with Offline Sync)

**Mobile side:**
```typescript
const transaction = {
  id: uuid(),
  offline_session_hash: sha256(deviceId + timestamp),
  store_id: "store_001",
  user_id: "user_123",
  items: [{ product_id, quantity, unit_price, tax_amount }],
  total_amount: 1000,
  payment_method: "cash",
  is_sync_online: false
};

// Save to local DB
await DatabaseService.createTransaction(transaction);

// If online, also sync
if (isOnline) {
  await ApiClient.post('/transactions', transaction);
}
```

**Backend side (POST /transactions):**
```typescript
// 1. Check if already synced (idempotency)
const existing = await db.transaction.findUnique({
  where: { offline_session_hash }
});

if (existing) {
  return existing; // Already synced, return cached result
}

// 2. Create transaction in transaction block
await db.$transaction(async (tx) => {
  // Create transaction record
  await tx.transaction.create({ data: transactionData });

  // Create line items
  for (const item of items) {
    await tx.transactionItem.create({ data: item });
  }

  // Deduct from inventory
  for (const item of items) {
    await tx.inventory.update({
      where: { product_id: item.product_id },
      data: { quantity_on_hand: { decrement: item.quantity } }
    });
  }

  // Update customer stats
  if (customer_id) {
    await tx.customer.update({
      where: { id: customer_id },
      data: {
        total_spent: { increment: total },
        transaction_count: { increment: 1 }
      }
    });
  }
});

// 3. Mark as synced in offline queue
await db.offlineSyncQueue.update({
  where: { offline_session_hash },
  data: { status: 'synced' }
});
```

---

## API Endpoint Examples

### 1. Biometric Login

**Request:**
```bash
POST /v1/auth/biometric-verify
{
  "biometric_token_hash": "sha256_of_biometric",
  "device_id": "device_uuid"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "user": {
      "id": "uuid",
      "email": "cashier@store.com",
      "first_name": "John",
      "role": "cashier",
      "store_id": "store_001"
    }
  }
}
```

### 2. Create Transaction (Offline)

**Request:**
```bash
POST /v1/transactions
Authorization: Bearer <token>
{
  "store_id": "store_001",
  "user_id": "user_uuid",
  "offline_session_hash": "sha256_hash",
  "subtotal": 900,
  "tax_amount": 100,
  "discount_amount": 0,
  "total_amount": 1000,
  "payment_method": "cash",
  "items": [
    {
      "product_id": "prod_uuid",
      "quantity": 2,
      "unit_price": 450,
      "tax_amount": 100,
      "line_total": 1000
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "tx_uuid",
    "receipt_number": "RCP-1234567890-xyz",
    "status": "completed",
    "total_amount": 1000
  }
}
```

### 3. Batch Sync (Mobile → Server)

**Request:**
```bash
POST /v1/transactions/batch
Authorization: Bearer <token>
{
  "transactions": [
    { /* transaction 1 */ },
    { /* transaction 2 */ },
    { /* transaction 3 */ }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "offline_session_hash": "hash1",
        "transaction_id": "tx_uuid1",
        "status": "synced"
      }
    ],
    "errors": [
      {
        "offline_session_hash": "hash2",
        "error": "Insufficient inventory",
        "status": "failed"
      }
    ]
  }
}
```

### 4. Get Low Stock Alerts

**Request:**
```bash
GET /v1/inventory/low-stock
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "product_id": "prod_uuid",
      "product_name": "Widget A",
      "current_quantity": 5,
      "low_stock_threshold": 10,
      "alert_level": "URGENT"
    }
  ],
  "count": 1
}
```

### 5. Dashboard Analytics

**Request:**
```bash
GET /v1/analytics/dashboard
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "total_transactions": 45,
    "total_revenue": 45000,
    "total_items_sold": 120,
    "top_products": [
      {
        "product_id": "prod1",
        "name": "Widget A",
        "qty": 45,
        "revenue": 20000
      }
    ]
  }
}
```

---

## Redux State Shape

```typescript
// Auth State
{
  isAuthenticated: true,
  user: {
    id: "uuid",
    email: "cashier@store.com",
    first_name: "John",
    role: "cashier",
    store_id: "store_001"
  },
  access_token: "jwt...",
  biometric_enabled: true,
  device_id: "device_uuid"
}

// Cart State
{
  items: [
    {
      product_id: "prod1",
      product_name: "Widget A",
      quantity: 2,
      unit_price: 450,
      tax_amount: 100,
      line_total: 1000
    }
  ],
  subtotal: 900,
  tax_amount: 100,
  discount_amount: 0,
  total: 1000,
  payment_method: "cash"
}

// Sync State
{
  mode: "ONLINE",
  isConnected: true,
  pendingSyncCount: 0,
  syncQueue: [
    {
      id: "uuid",
      transaction_id: "tx_uuid",
      offline_session_hash: "hash",
      status: "synced"
    }
  ],
  lastSyncAt: "2024-01-15T10:30:00Z"
}

// Inventory State
{
  products: [ /* all products */ ],
  inventory: Map { "prod1" => { quantity_on_hand: 50, status: "IN_STOCK" } },
  searchQuery: "widget",
  filteredProducts: [ /* search results */ ],
  lowStockAlerts: [ /* items < threshold */ ],
  lastSync: "2024-01-15T10:30:00Z"
}
```

---

## Testing Workflows

### Test 1: Online Transaction (Happy Path)

1. Start backend: `npm run dev` (in backend dir)
2. Start mobile: `npm start` (in mobile dir)
3. Login with biometric (or mock credentials)
4. Add items to cart
5. Select "Cash" payment
6. Click "Complete Transaction"
7. Check backend logs: Should see transaction created
8. Check database: `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1;`

**Expected:** Transaction synced immediately, is_sync_online = true

### Test 2: Offline → Online Sync

1. Disconnect internet (flight mode on mobile)
2. Create transaction (same as Test 1)
3. See "⚠️ Working offline - transactions queued"
4. Transaction stored locally, is_sync_online = false
5. Re-enable internet
6. Wait 30 seconds (auto-sync triggers)
7. See notification: "Sync completed: 1 transactions synced"
8. Check backend: is_sync_online should now be true

**Expected:** Transactions automatically synced without user action

### Test 3: Inventory Deduction

1. Complete transaction for 10 units of Product A
2. Check inventory before: SELECT quantity_on_hand FROM inventory WHERE product_id = 'prod_a';
3. After transaction, quantity should decrease by 10
4. Low stock alert should appear if new quantity < threshold

**Expected:** Inventory correctly deducted in single transaction block

### Test 4: Low Stock Alert

1. Create product with low_stock_threshold = 5
2. Set inventory to 3 units
3. Open Inventory Screen
4. Should see red alert: "URGENT" for this product
5. Dashboard should show alert badge

**Expected:** Alerts display correctly for items below threshold

### Test 5: Analytics Dashboard

1. Complete 10 transactions with various products
2. Open Analytics tab
3. Dashboard shows:
   - Total transactions: 10
   - Total revenue: sum of all totals
   - Top products: ranked by revenue
4. Payment method breakdown visible
5. Employee performance stats shown

**Expected:** Real-time analytics calculated correctly

---

## Performance Tuning

### Mobile Performance

1. **Reduce app bundle size:**
   ```bash
   # Remove unused dependencies
   npm prune --production
   # Use dynamic imports for screens
   const Checkout = lazy(() => import('./CheckoutScreen'));
   ```

2. **Optimize rendering:**
   - Use `memo()` for expensive components
   - Implement virtualized lists for 1000s of products
   - Avoid inline function definitions in renders

3. **Database optimization:**
   - Create indexes on frequently queried fields
   - Use `limit()` in queries
   - Cache product catalog locally

4. **Network:**
   - Batch sync requests (10-50 transactions per request)
   - Use exponential backoff for retries
   - Cache API responses (5-minute TTL)

### Backend Performance

1. **Database:**
   ```sql
   -- Add indexes
   CREATE INDEX idx_products_active ON products(is_active);
   CREATE INDEX idx_inventory_low_stock ON inventory(quantity_on_hand);
   
   -- Partition large tables
   CREATE TABLE transactions_2024_q1 PARTITION OF transactions
     FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
   ```

2. **Caching:**
   ```typescript
   // Redis cache for product catalog
   const products = await redis.get('products:catalog');
   if (!products) {
     const data = await db.product.findMany();
     await redis.setex('products:catalog', 3600, JSON.stringify(data));
   }
   ```

3. **Query optimization:**
   - Use `select()` to fetch only needed fields
   - Avoid N+1 queries with `include()`
   - Use materialized views for analytics

---

## Deployment

### Docker Deployment

```bash
# Build backend image
cd backend
docker build -t mobile-pos-api .

# Run with docker-compose
docker-compose up -d

# Check logs
docker logs mobilepos_api

# Migrate database
docker exec mobilepos_api npm run migrate

# Scale API
docker-compose up -d --scale api=3
```

### Mobile App Distribution

```bash
# Build APK for Android
eas build --platform android --release

# Build for iOS
eas build --platform ios --release

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

### Environment Setup

```bash
# Production
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db.rds.amazonaws.com:5432/mobilepos
JWT_SECRET=<strong_random_key>
ALLOWED_ORIGINS=https://mobilepos.example.com

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
LOG_LEVEL=info
```

---

## Next Steps (Beyond MVP)

1. **AI-powered features:**
   - Intelligent product recommendations
   - Demand forecasting
   - Anomaly detection in sales patterns

2. **Advanced inventory:**
   - Multi-warehouse management
   - Automatic reorder points
   - Supplier integration

3. **Customer intelligence:**
   - Loyalty program automation
   - Personalized promotions
   - Purchase history segmentation

4. **Real-time features:**
   - WebSocket for live inventory updates
   - Push notifications for low stock
   - Real-time employee performance tracking

5. **Analytics:**
   - Interactive dashboards with drill-downs
   - Predictive analytics
   - Custom report builder

---

## Troubleshooting

### Issue: "Biometric not available"
**Solution:** Enroll fingerprint/face ID in device settings before running app

### Issue: "Network error" in offline mode
**Solution:** This is expected. Check `ApiClient.getOnlineStatus()` and handle gracefully

### Issue: Transactions not syncing
**Check:**
1. Network connection: `adb shell ip route` (Android)
2. Backend running: `curl http://localhost:3000/health`
3. Logs: `docker logs mobilepos_api`
4. Database: `SELECT * FROM offline_sync_queue;`

### Issue: Slow product search
**Solution:**
1. Increase Realm index
2. Reduce product list to store's items only
3. Use fuzzy matching (Fuse.js is fast)

### Issue: Database migration fails
**Solution:**
```bash
# Reset database
dropdb mobilepos
createdb mobilepos

# Re-run migrations
npm run migrate
npm run seed
```

---

## Support & Resources

- **API Docs:** See API_DOCUMENTATION.md
- **Database Schema:** See DATABASE_SCHEMA.md
- **Contributing:** See CONTRIBUTING.md
- **Issues:** GitHub Issues tracker

Happy coding! 🚀
