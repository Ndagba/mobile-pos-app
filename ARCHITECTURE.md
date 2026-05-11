# Mobile POS System - Complete Architecture & Design

## 1. SYSTEM ARCHITECTURE OVERVIEW

### 1.1 High-Level Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                     MOBILE APPLICATION                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     UI Layer (React Native)              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │  │
│  │  │Dashboard │  │Checkout  │  │Inventory │  ┌─────────┐ │  │
│  │  │Screen    │  │Screen    │  │Screen    │  │Analytics│ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                            │
│  ┌────────────────▼───────────────────────────────────────┐  │
│  │         State Management (Redux Toolkit)               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │  │
│  │  │ Auth Store  │  │ Cart Store  │  │ Inventory    │   │  │
│  │  │             │  │             │  │ Store        │   │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘   │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                            │
│  ┌────────────────▼───────────────────────────────────────┐  │
│  │         Service Layer                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   │  │
│  │  │ API Client   │  │ Sync Manager │  │ Search     │   │  │
│  │  │ (offline-    │  │ (background) │  │ Service    │   │  │
│  │  │ first)       │  │              │  │            │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────┘   │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                            │
│  ┌────────────────▼───────────────────────────────────────┐  │
│  │         Local Persistence Layer                        │  │
│  │  ┌──────────────┐  ┌──────────────┐                   │  │
│  │  │  SQLite DB   │  │  Async Store │                   │  │
│  │  │              │  │  (sensitive) │                   │  │
│  │  └──────────────┘  └──────────────┘                   │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                            │
└───────────────────┼────────────────────────────────────────────┘
                    │
           ┌────────▼────────┐
           │  Network Layer  │
           │  (REST API)     │
           └────────┬────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼────┐   ┌─────▼────┐   ┌─────▼─────┐
│  Queue │   │ Firewall │   │  API Rate │
│ Manager│   │ / Auth   │   │  Limiting │
└────────┘   └──────────┘   └───────────┘
    │               │               │
    └───────────────┼───────────────┘
                    │
        ┌───────────▼──────────────┐
        │    CLOUD BACKEND         │
        │  (Node.js + Express)     │
        │  PostgreSQL Database     │
        └──────────────────────────┘
```

### 1.2 Technology Stack
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React Native + Expo | Cross-platform, hot reload, rapid MVP |
| State | Redux Toolkit | Predictable state, offline sync tracking |
| Local DB | SQLite (Realm alternative) | Relational queries, offline sync |
| API Client | Axios + Adapters | Offline queueing, retry logic |
| Backend | Node.js + Express | JavaScript, rapid development |
| Cloud DB | PostgreSQL | ACID compliance, spatial queries for inventory |
| Auth | Biometric (react-native-biometrics) | PCI compliance, UX |
| Analytics | Segment / PostHog | Event tracking, funnels |

---

## 2. FILE STRUCTURE

```
mobile-pos/
├── apps/
│   ├── mobile/                          # React Native app
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── AuthScreen.tsx
│   │   │   │   ├── DashboardScreen.tsx
│   │   │   │   ├── CheckoutScreen.tsx
│   │   │   │   ├── InventoryScreen.tsx
│   │   │   │   ├── AnalyticsScreen.tsx
│   │   │   │   └── SettingsScreen.tsx
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── common/
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Card.tsx
│   │   │   │   │   ├── Modal.tsx
│   │   │   │   │   ├── SkeletonLoader.tsx
│   │   │   │   │   └── TabBar.tsx
│   │   │   │   │
│   │   │   │   ├── checkout/
│   │   │   │   │   ├── CartItem.tsx
│   │   │   │   │   ├── CartSummary.tsx
│   │   │   │   │   ├── PaymentModal.tsx
│   │   │   │   │   └── BarcodeScanner.tsx
│   │   │   │   │
│   │   │   │   ├── inventory/
│   │   │   │   │   ├── ProductCard.tsx
│   │   │   │   │   ├── LowStockAlert.tsx
│   │   │   │   │   └── BatchTracking.tsx
│   │   │   │   │
│   │   │   │   └── analytics/
│   │   │   │       ├── SalesChart.tsx
│   │   │   │       ├── TopProducts.tsx
│   │   │   │       └── EmployeeStats.tsx
│   │   │   │
│   │   │   ├── redux/
│   │   │   │   ├── slices/
│   │   │   │   │   ├── authSlice.ts
│   │   │   │   │   ├── cartSlice.ts
│   │   │   │   │   ├── inventorySlice.ts
│   │   │   │   │   ├── syncSlice.ts
│   │   │   │   │   └── uiSlice.ts
│   │   │   │   │
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── syncMiddleware.ts
│   │   │   │   │   └── analyticsMiddleware.ts
│   │   │   │   │
│   │   │   │   ├── store.ts
│   │   │   │   └── rootReducer.ts
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── api/
│   │   │   │   │   ├── apiClient.ts        # Offline-first HTTP client
│   │   │   │   │   ├── endpoints.ts
│   │   │   │   │   └── retryHandler.ts
│   │   │   │   │
│   │   │   │   ├── database/
│   │   │   │   │   ├── db.ts               # SQLite initialization
│   │   │   │   │   ├── schemas.ts
│   │   │   │   │   ├── migrations.ts
│   │   │   │   │   └── repositories/
│   │   │   │   │       ├── TransactionRepository.ts
│   │   │   │   │       ├── ProductRepository.ts
│   │   │   │   │       ├── InventoryRepository.ts
│   │   │   │   │       └── CustomerRepository.ts
│   │   │   │   │
│   │   │   │   ├── sync/
│   │   │   │   │   ├── SyncManager.ts      # Orchestrates offline sync
│   │   │   │   │   ├── SyncQueue.ts        # Manages pending operations
│   │   │   │   │   └── ConflictResolver.ts
│   │   │   │   │
│   │   │   │   ├── auth/
│   │   │   │   │   ├── BiometricAuth.ts
│   │   │   │   │   ├── TokenManager.ts
│   │   │   │   │   └── SecurityUtils.ts
│   │   │   │   │
│   │   │   │   ├── payment/
│   │   │   │   │   ├── PaymentProcessor.ts
│   │   │   │   │   ├── PaymentGateway.ts
│   │   │   │   │   └── ReceiptGenerator.ts
│   │   │   │   │
│   │   │   │   ├── search/
│   │   │   │   │   ├── SearchEngine.ts     # Fuse.js integration
│   │   │   │   │   └── FuzzyMatcher.ts
│   │   │   │   │
│   │   │   │   └── inventory/
│   │   │   │       ├── InventoryManager.ts
│   │   │   │       ├── StockAlert.ts
│   │   │   │       └── BatchExpiry.ts
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useOfflineSync.ts
│   │   │   │   ├── useSearch.ts
│   │   │   │   ├── useCart.ts
│   │   │   │   ├── useInventory.ts
│   │   │   │   ├── useNetworkStatus.ts
│   │   │   │   └── useBiometric.ts
│   │   │   │
│   │   │   ├── theme/
│   │   │   │   ├── materialDesign3.ts     # MD3 tokens & colors
│   │   │   │   ├── darkTheme.ts
│   │   │   │   └── lightTheme.ts
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── validators.ts
│   │   │   │   ├── formatters.ts
│   │   │   │   ├── tax.ts                  # GST calculations
│   │   │   │   ├── deviceUtils.ts
│   │   │   │   └── constants.ts
│   │   │   │
│   │   │   ├── types/
│   │   │   │   ├── index.ts                # All TypeScript interfaces
│   │   │   │   ├── models.ts
│   │   │   │   ├── api.ts
│   │   │   │   └── enums.ts
│   │   │   │
│   │   │   ├── App.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── app.json                        # Expo config
│   │   ├── eas.json                        # EAS Build config
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                                # Future web dashboard (optional)
│       └── ...
│
├── backend/                                # Node.js API Server
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── transactions.routes.ts
│   │   │   │   ├── products.routes.ts
│   │   │   │   ├── inventory.routes.ts
│   │   │   │   ├── customers.routes.ts
│   │   │   │   ├── employees.routes.ts
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── sync.routes.ts
│   │   │   │   └── receipts.routes.ts
│   │   │   │
│   │   │   ├── controllers/
│   │   │   │   ├── AuthController.ts
│   │   │   │   ├── TransactionController.ts
│   │   │   │   ├── InventoryController.ts
│   │   │   │   ├── CustomerController.ts
│   │   │   │   └── AnalyticsController.ts
│   │   │   │
│   │   │   └── middleware/
│   │   │       ├── auth.middleware.ts
│   │   │       ├── errorHandler.middleware.ts
│   │   │       ├── rateLimit.middleware.ts
│   │   │       └── logger.middleware.ts
│   │   │
│   │   ├── services/
│   │   │   ├── AuthService.ts
│   │   │   ├── TransactionService.ts
│   │   │   ├── InventoryService.ts
│   │   │   ├── CustomerService.ts
│   │   │   ├── AnalyticsService.ts
│   │   │   ├── PaymentService.ts
│   │   │   ├── ReceiptService.ts
│   │   │   └── SyncService.ts
│   │   │
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── Product.ts
│   │   │   ├── Transaction.ts
│   │   │   ├── TransactionItem.ts
│   │   │   ├── Inventory.ts
│   │   │   ├── Customer.ts
│   │   │   ├── Employee.ts
│   │   │   └── OfflineSync.ts
│   │   │
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init_schema.sql
│   │   │   │   ├── 002_add_audit_logs.sql
│   │   │   │   ├── 003_add_indexes.sql
│   │   │   │   └── 004_add_triggers.sql
│   │   │   │
│   │   │   └── seeders/
│   │   │       ├── seed.products.ts
│   │   │       └── seed.categories.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── validators.ts
│   │   │   ├── formatters.ts
│   │   │   ├── encryption.ts
│   │   │   ├── logger.ts
│   │   │   └── errorHandler.ts
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── express.d.ts
│   │   │
│   │   ├── config/
│   │   │   ├── database.config.ts
│   │   │   ├── app.config.ts
│   │   │   ├── auth.config.ts
│   │   │   └── payment.config.ts
│   │   │
│   │   └── index.ts                       # Express app entry
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   │
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── package.json
│
├── docs/
│   ├── API_DOCUMENTATION.md
│   ├── DATABASE_SCHEMA.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
│
├── .github/
│   ├── workflows/
│   │   ├── ci-mobile.yml
│   │   ├── ci-backend.yml
│   │   └── deployment.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docker-compose.yml                    # Local dev environment
├── .env.example
└── README.md
```

---

## 3. DATABASE SCHEMA (PostgreSQL)

### 3.1 Core Tables

**Users (Authentication)**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role ENUM('admin', 'manager', 'cashier') DEFAULT 'cashier',
  biometric_token_hash VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  device_id VARCHAR(255),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_device_id ON users(device_id);
```

**Categories**
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT category_name_length CHECK (LENGTH(name) >= 2)
);
```

**Products**
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  marked_price DECIMAL(12, 2) NOT NULL,
  effective_price DECIMAL(12, 2) NOT NULL,
  cost_price DECIMAL(12, 2),
  tax_rate DECIMAL(5, 2) DEFAULT 0.00, -- GST percentage
  barcode VARCHAR(50) UNIQUE,
  image_url VARCHAR(500),
  unit VARCHAR(20) DEFAULT 'piece', -- 'piece', 'kg', 'liter', etc.
  is_active BOOLEAN DEFAULT TRUE,
  search_vector tsvector, -- Full-text search
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT price_consistency CHECK (effective_price <= marked_price),
  CONSTRAINT positive_prices CHECK (marked_price > 0 AND effective_price > 0),
  CONSTRAINT valid_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = TRUE;

-- Trigger to update search vector
CREATE TRIGGER products_search_vector_update
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION tsvector_update_trigger(search_vector, 'pg_catalog.english', name, description);
```

**Inventory**
```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  quantity_on_hand BIGINT NOT NULL DEFAULT 0,
  quantity_reserved BIGINT NOT NULL DEFAULT 0, -- For pending transactions
  low_stock_threshold BIGINT DEFAULT 10,
  reorder_point BIGINT DEFAULT 20,
  last_stock_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT non_negative_quantity CHECK (quantity_on_hand >= 0),
  CONSTRAINT valid_reserved CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory(quantity_on_hand) WHERE quantity_on_hand < low_stock_threshold;

-- Materialized view for fast reporting
CREATE MATERIALIZED VIEW inventory_status AS
SELECT 
  p.id,
  p.name,
  p.sku,
  i.quantity_on_hand,
  i.quantity_reserved,
  (i.quantity_on_hand - i.quantity_reserved) as available_quantity,
  i.low_stock_threshold,
  CASE 
    WHEN (i.quantity_on_hand - i.quantity_reserved) <= i.low_stock_threshold THEN 'LOW'
    WHEN (i.quantity_on_hand - i.quantity_reserved) = 0 THEN 'OUT_OF_STOCK'
    ELSE 'IN_STOCK'
  END as status
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
WHERE p.is_active = TRUE;
```

**Batch & Expiry Tracking**
```sql
CREATE TABLE batch_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  manufactured_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  quantity BIGINT NOT NULL,
  warehouse_location VARCHAR(100),
  is_expired BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT batch_unique UNIQUE(product_id, batch_number),
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT valid_dates CHECK (manufactured_date <= expiry_date)
);

CREATE INDEX idx_batch_expiry ON batch_tracking(expiry_date) WHERE is_expired = FALSE;
CREATE INDEX idx_batch_product ON batch_tracking(product_id);
```

**Customers**
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  date_of_birth DATE,
  loyalty_points BIGINT DEFAULT 0,
  total_spent DECIMAL(15, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  last_transaction_at TIMESTAMP,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
```

**Transactions (Sales)**
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(100) NOT NULL, -- Identifies which POS terminal
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Offline sync tracking
  offline_session_hash VARCHAR(500), -- Unique hash from offline transaction
  is_sync_online BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP,
  
  -- Transaction details
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  
  -- Payment info
  payment_method ENUM('cash', 'card', 'mobile_wallet') NOT NULL,
  payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  payment_reference VARCHAR(255), -- Card transaction ID, UPI ref, etc.
  
  -- Receipt
  receipt_number VARCHAR(50) UNIQUE,
  receipt_url VARCHAR(500),
  
  -- Audit
  status ENUM('completed', 'voided', 'refunded') DEFAULT 'completed',
  void_reason TEXT,
  voided_at TIMESTAMP,
  voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT positive_total CHECK (total_amount >= 0),
  CONSTRAINT valid_sync_hash_length CHECK (offline_session_hash IS NULL OR LENGTH(offline_session_hash) > 0)
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_store ON transactions(store_id);
CREATE INDEX idx_transactions_sync ON transactions(offline_session_hash) WHERE is_sync_online = FALSE;
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_payment_status ON transactions(payment_status);

-- Trigger to auto-update customer stats
CREATE TRIGGER update_customer_stats
AFTER INSERT ON transactions
FOR EACH ROW
WHEN (NEW.payment_status = 'completed')
EXECUTE FUNCTION update_customer_purchase_stats();
```

**Transaction Items (Line Items)**
```sql
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL,
  batch_id UUID REFERENCES batch_tracking(id), -- For expiry tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_price CHECK (unit_price > 0),
  CONSTRAINT positive_total CHECK (line_total >= 0)
);

CREATE INDEX idx_transaction_items_tx ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_product ON transaction_items(product_id);
```

**Offline Sync Queue**
```sql
CREATE TABLE offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  offline_session_hash VARCHAR(500) NOT NULL,
  operation_type ENUM('create', 'update', 'void') DEFAULT 'create',
  payload JSONB NOT NULL, -- Complete transaction payload
  status ENUM('pending', 'syncing', 'synced', 'failed', 'conflict') DEFAULT 'pending',
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP,
  
  CONSTRAINT max_attempts CHECK (attempt_count <= 10)
);

CREATE INDEX idx_sync_queue_device ON offline_sync_queue(device_id);
CREATE INDEX idx_sync_queue_status ON offline_sync_queue(status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_sync_queue_hash ON offline_sync_queue(offline_session_hash);
```

**Audit Logs**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL, -- 'LOGIN', 'VOID_TRANSACTION', 'MODIFY_PRODUCT', etc.
  resource_type VARCHAR(100), -- 'transaction', 'inventory', 'user', etc.
  resource_id UUID,
  changes JSONB, -- Before/after values
  ip_address INET,
  device_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

**Analytics Cache (Pre-computed)**
```sql
CREATE TABLE daily_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(100) NOT NULL,
  report_date DATE NOT NULL,
  total_transactions INTEGER DEFAULT 0,
  total_revenue DECIMAL(15, 2) DEFAULT 0,
  total_items_sold BIGINT DEFAULT 0,
  avg_transaction_value DECIMAL(15, 2) DEFAULT 0,
  top_products JSONB, -- [{product_id, name, qty, revenue}]
  payment_breakdown JSONB, -- {cash: amount, card: amount, wallet: amount}
  employee_performance JSONB, -- [{user_id, name, transactions, revenue}]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT report_unique UNIQUE(store_id, report_date)
);

CREATE INDEX idx_daily_analytics_date ON daily_analytics(report_date DESC);
```

---

## 4. API ENDPOINTS

### Base URL: `https://api.mobilepos.com/v1`

### 4.1 Authentication Endpoints
```
POST   /auth/register          # Employee registration
POST   /auth/login             # Generate JWT + refresh token
POST   /auth/biometric-verify  # Verify biometric token
POST   /auth/refresh-token     # Refresh JWT
POST   /auth/logout            # Revoke tokens
GET    /auth/me                # Get current user profile
```

### 4.2 Product & Inventory Endpoints
```
GET    /products               # List all products with pagination
GET    /products/:id           # Get product details
GET    /products/search?q=     # Fuzzy search products
POST   /products               # Create product (admin only)
PATCH  /products/:id           # Update product
DELETE /products/:id           # Soft delete product

GET    /categories             # List categories
POST   /categories             # Create category
PATCH  /categories/:id         # Update category

GET    /inventory              # Get inventory status
PATCH  /inventory/:productId   # Update stock level
GET    /inventory/low-stock    # Get low-stock alerts
GET    /inventory/expiring     # Get expiring batches

GET    /batches                # List all batches
POST   /batches                # Create batch
PATCH  /batches/:id            # Update batch
```

### 4.3 Transaction Endpoints
```
POST   /transactions           # Create new transaction
GET    /transactions           # Get transaction history (paginated)
GET    /transactions/:id       # Get transaction details
POST   /transactions/:id/void  # Void a transaction
GET    /transactions/:id/receipt # Get receipt details

POST   /transactions/batch     # Batch upload offline transactions
POST   /sync/status            # Check sync status for device
```

### 4.4 Customer Endpoints
```
POST   /customers              # Create new customer
GET    /customers              # List customers
GET    /customers/:id          # Get customer profile
PATCH  /customers/:id          # Update customer
POST   /customers/:id/loyalty  # Add loyalty points
GET    /customers/:id/history  # Get purchase history
```

### 4.5 Analytics Endpoints
```
GET    /analytics/dashboard    # Daily dashboard metrics
GET    /analytics/sales?date_from=&date_to=  # Sales report
GET    /analytics/top-products?period=daily   # Top products
GET    /analytics/employee-performance        # Employee KPIs
GET    /analytics/payment-methods             # Payment breakdown
GET    /analytics/inventory-turnover          # Stock movement
```

### 4.6 Employees (Staff Management)
```
GET    /employees              # List employees
POST   /employees              # Create employee
PATCH  /employees/:id          # Update employee
DELETE /employees/:id          # Deactivate employee
GET    /employees/:id/performance # Get employee stats
```

### 4.7 Receipts
```
POST   /receipts/email         # Send receipt via email
POST   /receipts/sms           # Send receipt via SMS
GET    /receipts/:id/pdf       # Generate PDF receipt
```

---

## 5. STATE MANAGEMENT (Redux Slices)

### 5.1 Auth Slice
```typescript
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  biometricEnabled: boolean;
  deviceId: string;
  lastLoginAt: ISO8601;
  role: 'admin' | 'manager' | 'cashier';
  permissions: string[];
}
```

### 5.2 Cart Slice
```typescript
interface CartState {
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  customerInfo: Partial<Customer> | null;
  paymentMethod: PaymentMethod | null;
  offlineSessionHash: string; // For sync correlation
  isProcessing: boolean;
}
```

### 5.3 Inventory Slice
```typescript
interface InventoryState {
  products: Product[];
  categories: Category[];
  searchQuery: string;
  filteredProducts: Product[];
  lowStockAlerts: Product[];
  expiringBatches: BatchTracking[];
  loading: boolean;
  lastSync: ISO8601;
}
```

### 5.4 Sync Slice
```typescript
interface SyncState {
  mode: 'ONLINE' | 'OFFLINE' | 'TRANSITIONING';
  isConnected: boolean;
  pendingSyncCount: number;
  syncQueue: SyncQueueItem[];
  lastSyncAt: ISO8601;
  syncErrors: SyncError[];
  autoSyncEnabled: boolean;
  conflictResolutions: ConflictResolution[];
}
```

---

## 6. OFFLINE SYNC ARCHITECTURE

### 6.1 State Transition Diagram
```
┌─────────────┐
│   ONLINE    │ ◄─────────────────────┐
└──────┬──────┘                        │
       │ (Network lost)                │ (Network restored)
       │                               │
       ▼                               │
┌──────────────────┐          ┌────────┴─────────────┐
│  TRANSITIONING   │          │  OFFLINE (Queuing)  │
│  (Syncing)       │          └─────────────────────┘
└──────┬───────────┘                   ▲
       │ (Sync complete)               │
       │                               │
       └───────────────────────────────┘
```

### 6.2 Offline Transaction Flow
1. User creates transaction (network unknown)
2. Generate `offline_session_hash` = `SHA256(deviceId + timestamp + transactionId)`
3. Store in local SQLite with `is_sync_online = false`
4. Display success to user immediately (optimistic)
5. Add to `SyncQueue` table
6. When network returns, `SyncManager` picks up queued items
7. POST to `/transactions/batch` with offline_session_hash
8. Backend deduplicates using hash (idempotent)
9. On success, update local record with `is_sync_online = true`

### 6.3 Conflict Resolution Strategy
- Last-write-wins with timestamp
- For inventory: reject if local quantity > current server quantity
- For transaction void: reject if synced after original transaction
- Log all conflicts for manual review

---

## 7. SECURITY ARCHITECTURE

### 7.1 Authentication Flow
```
User Biometric Input
       │
       ▼
┌──────────────────────────┐
│ BiometricPrompt API      │
│ (Android/iOS native)     │
└────────┬─────────────────┘
         │ (Biometric valid)
         │
         ▼
┌──────────────────────────┐
│ Retrieve Device Key      │
│ (from Android Keystore)  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ POST /auth/biometric-verify
│ (with biometric_token_hash) │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Server validates token   │
│ Returns JWT + Refresh    │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Store in EncryptedSharedPrefs
│ (or iOS Keychain)        │
└──────────────────────────┘
```

### 7.2 Device Security Checks
```typescript
- Check if device is rooted/jailbroken
- Verify app signature certification
- Ensure encrypted storage for sensitive data
- Implement certificate pinning for API calls
- Rate limit login attempts (5 attempts → 30min lockout)
```

### 7.3 PCI Compliance
- **NO PIN entry in app** - External hardware only
- Card data not stored locally
- Payment details sent via PCI-compliant gateway
- Receipt masks PAN: "****-****-****-4242"
- All transactions logged for audit trail

### 7.4 Data Encryption
```typescript
- At rest: AES-256-GCM (SQLite)
- In transit: TLS 1.3+
- Sensitive fields encrypted with master key from Android Keystore
- Biometric token stored as salted hash
```

---

## 8. UI/UX ARCHITECTURE

### 8.1 Material Design 3 Theme System
```typescript
// Dynamic color tokens
const tokens = {
  primary: '#6750A4',
  secondary: '#625B71',
  tertiary: '#7D5260',
  error: '#B3261E',
  
  // Tonal variations
  primaryContainer: '#EADDFF',
  primaryTonal: '#F3E9FF', // For backgrounds
  
  // Surface elevations (replacing shadows)
  surface0: white,
  surface1: 'rgba(103, 80, 164, 0.05)',
  surface2: 'rgba(103, 80, 164, 0.08)',
  surface3: 'rgba(103, 80, 164, 0.11)',
  surface4: 'rgba(103, 80, 164, 0.12)',
  surface5: 'rgba(103, 80, 164, 0.14)',
};

// Typography scales
const typography = {
  displayLarge: { fontSize: 57, lineHeight: 64, fontWeight: 400 },
  displayMedium: { fontSize: 45, lineHeight: 52, fontWeight: 400 },
  displaySmall: { fontSize: 36, lineHeight: 44, fontWeight: 400 },
  
  headlineLarge: { fontSize: 32, lineHeight: 40, fontWeight: 400 },
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: 500 },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: 500 },
  
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: 500 },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: 400 }, // Minimum 16sp
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: 500 },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: 500 },
};
```

### 8.2 Screen Hierarchy
```
App.tsx
├── Navigation (Bottom Tab + Stack)
│
├── Auth Stack (if !authenticated)
│   └── AuthScreen
│
└── Main Stack (if authenticated)
    ├── DashboardScreen (Tab 1)
    │   ├── SalesChart
    │   ├── LowStockAlerts
    │   ├── QuickStats
    │   └── RecentTransactions
    │
    ├── CheckoutScreen (Tab 2)
    │   ├── ProductSearch
    │   ├── BarcodeScanner
    │   ├── Cart
    │   │   ├── CartItems
    │   │   └── CartSummary
    │   ├── PaymentModal
    │   └── ReceiptScreen
    │
    ├── InventoryScreen (Tab 3)
    │   ├── ProductList
    │   ├── LowStockAlerts
    │   ├── BatchExpiryList
    │   └── StockAdjustment
    │
    ├── AnalyticsScreen (Tab 4)
    │   ├── DateRangeSelector
    │   ├── SalesChart
    │   ├── TopProductsChart
    │   ├── EmployeePerformance
    │   └── PaymentMethodBreakdown
    │
    └── SettingsScreen (Tab 5)
        ├── UserProfile
        ├── Biometric Settings
        ├── Offline Sync Status
        ├── AppUpdate
        └── Logout
```

### 8.3 Responsive Design (Adaptive Layouts)
```typescript
// WindowSizeClass detection
enum WindowSizeClass {
  COMPACT,    // Phone (< 600dp)
  MEDIUM,     // Tablet (600-839dp)
  EXPANDED,   // Large tablet (840+dp)
}

// Checkout Screen layouts
const CheckoutScreen = () => {
  const windowSize = useWindowSize();
  
  return windowSize === COMPACT ? (
    // Single pane: Product search → Cart → Payment
    <SinglePaneLayout />
  ) : (
    // Multi-pane: Product search | Cart | Payment side-by-side
    <MultiPaneLayout />
  );
};
```

### 8.4 Loading States (Skeleton Screens)
```typescript
// Instead of spinner, use shimmer skeleton
<SkeletonLoader>
  <SkeletonBlock width="100%" height={100} />
  <SkeletonBlock width="100%" height={60} />
  <SkeletonBlock width="80%" height={40} />
</SkeletonLoader>

// Shimmer animation CSS
@keyframes shimmer {
  0% {
    backgroundPosition: -1000px 0;
  }
  100% {
    backgroundPosition: 1000px 0;
  }
}
```

### 8.5 Accessibility Standards
```
✓ Minimum body text: 16sp
✓ Line height: 1.5x minimum
✓ Button targets: 48dp × 48dp (fat-finger friendly)
✓ Color contrast: WCAG AA (4.5:1 for text)
✓ Touch targets: 1/8" minimum (48px)
✓ Screen reader support via accessibility labels
✓ Keyboard navigation for all interactive elements
```

---

## 9. PERFORMANCE OPTIMIZATION

### 9.1 Mobile-First Metrics
```
Target KPIs:
- First Contentful Paint (FCP): < 1.5s
- Time to Interactive (TTI): < 3s
- App startup: < 2s
- Checkout flow: < 5s (end-to-end)
- Search results: < 200ms (local Fuse.js)
- Sync batch processing: < 30s (100 transactions)
```

### 9.2 Optimization Strategies
```typescript
// 1. Lazy loading screens
const DashboardScreen = lazy(() => import('./screens/DashboardScreen'));

// 2. Code splitting by route
const Analytics = lazy(() => import('./screens/AnalyticsScreen'));

// 3. Image optimization
<Image 
  source={{uri: productImage}}
  optimized={true}
  cacheControl="force-cache"
/>

// 4. Memoization of expensive components
const CartItem = memo(({ item, onRemove }) => {
  return <CartItemView item={item} onRemove={onRemove} />;
});

// 5. Virtual scrolling for large lists
<VirtualizedList
  data={1000Products}
  renderItem={renderProduct}
  windowSize={10}
/>

// 6. Database query optimization
const activeProducts = await db.products
  .where('is_active').equals(true)
  .limit(100)
  .toArray(); // Indexed query

// 7. Background sync in Service Worker
BackgroundSync.register('sync-transactions', { minInterval: 30000 });
```

---

## 10. DEPLOYMENT & SCALABILITY

### 10.1 Mobile App Distribution
```
Development: Expo Go / EAS Preview
Staging: TestFlight (iOS) / Google Play Internal Testing
Production: 
  - Apple App Store (iOS)
  - Google Play Store (Android)
  - Custom APK distribution for enterprise
```

### 10.2 Backend Scalability
```
- Horizontal scaling: Load balancer (AWS ALB)
- Database: Read replicas for reporting
- Caching: Redis for product catalog, inventory
- Message queue: RabbitMQ for async sync jobs
- CDN: CloudFront for static assets (images, docs)
```

### 10.3 Database Optimization
```sql
-- Partitioning transactions by month
CREATE TABLE transactions_2025_01 PARTITION OF transactions
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Archiving old transactions
MOVE TABLE transactions_2024 TO archive_schema;

-- Replication setup
-- Primary: Master DB for writes
-- Replica 1: Read-only for analytics queries
-- Replica 2: Read-only for backups
```

---

## 11. MONITORING & OBSERVABILITY

### 11.1 Logging
```typescript
// Structured logging
logger.info({
  event: 'transaction_completed',
  transactionId: tx.id,
  amount: tx.total_amount,
  paymentMethod: tx.payment_method,
  duration_ms: Date.now() - startTime,
  userId: user.id,
});

// Error tracking
logger.error({
  event: 'sync_failed',
  error: error.message,
  stack: error.stack,
  deviceId: device.id,
  syncQueueLength: syncQueue.length,
});
```

### 11.2 Metrics & Alerts
```
- Transaction success rate
- Sync completion time
- API latency (p50, p95, p99)
- Database query performance
- App crash rate
- Device storage usage
```

### 11.3 Analytics
```
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Transaction volume by hour
- Top products by revenue
- Employee productivity metrics
- Payment method breakdown
```

---

## 12. TESTING STRATEGY

### 12.1 Unit Tests
- Redux reducers
- Utility functions (tax calculation, formatters)
- API client (offline queueing logic)

### 12.2 Integration Tests
- Transaction flow (create → sync → confirm)
- Inventory updates
- Search functionality
- Database operations

### 12.3 E2E Tests
- Complete checkout flow
- Offline mode simulation
- Sync recovery
- Biometric authentication

### 12.4 Performance Tests
- Load testing (1000 concurrent transactions)
- Database query performance
- Search latency (Fuse.js)
- App startup time

---

## 13. DEVELOPMENT ROADMAP (MVP → Scale)

### Phase 1 (MVP): 6-8 weeks
- [x] Basic auth (biometric)
- [x] Checkout + payment processing
- [x] Offline transactions
- [x] Simple inventory
- [x] Basic reporting
- [x] Local sync

### Phase 2 (8-12 weeks)
- [ ] Customer loyalty program
- [ ] Advanced inventory (batches, expiry)
- [ ] Multi-store support
- [ ] Employee analytics
- [ ] SMS/Email receipts

### Phase 3 (12-16 weeks)
- [ ] AI-powered search/recommendations
- [ ] Predictive inventory
- [ ] Dynamic pricing
- [ ] Customer segmentation
- [ ] Supplier integration

---

This architecture is designed for:
✅ **Offline-first reliability** - Works without internet
✅ **Scalability** - Supports 100s of stores, 10,000s of SKUs
✅ **PCI compliance** - Zero PIN/card data locally
✅ **Security** - Biometric + encryption at rest/transit
✅ **UX** - Material Design 3, fast search, responsive
✅ **Analytics** - Real-time insights into sales/inventory
✅ **Maintenance** - Clear separation of concerns, testable

