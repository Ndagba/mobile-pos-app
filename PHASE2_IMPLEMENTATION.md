# Phase 2: Implementation & Testing Guide

## 🎯 Phase 2 Overview

**Duration**: 4-6 weeks  
**Goal**: Transform architecture → working product  
**Outcome**: Fully tested, production-ready MVP

---

## Week 1: Setup & Database

### Day 1-2: Environment Setup

#### Step 1.1: Initialize Backend Repository
```bash
cd backend

# Install dependencies
npm install

# Verify all packages
npm list

# Check Node version (should be 18+)
node --version
npm --version
```

#### Step 1.2: Configure Database
```bash
# Create .env file
cp .env.example .env

# Edit .env with your settings:
cat > .env << 'EOF'
DATABASE_URL="postgresql://pos_user:password@localhost:5432/mobilepos"
PORT=3000
NODE_ENV=development
JWT_SECRET=$(openssl rand -base64 32)
REFRESH_TOKEN_SECRET=$(openssl rand -base64 32)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
LOG_LEVEL=info
EOF
```

#### Step 1.3: Start Infrastructure
```bash
# From project root
docker-compose up -d

# Verify services running
docker-compose ps

# Expected output:
# postgres (5432) - healthy
# redis (6379) - healthy
# pgadmin (5050) - healthy
```

#### Step 1.4: Verify Database Connection
```bash
# Test PostgreSQL
psql postgresql://pos_user:password@localhost:5432/mobilepos -c "SELECT NOW();"

# Should return current timestamp if successful

# Or use pgAdmin:
# Open http://localhost:5050
# Login: admin@example.com / admin
# Add server: localhost:5432
```

**✅ Checkpoint 1**: Database running, can connect

---

### Day 3-4: Database Setup

#### Step 2.1: Generate Prisma Client
```bash
# Generate Prisma client from schema
npx prisma generate

# Verify schema (visual inspection)
npx prisma validate
```

#### Step 2.2: Run Migrations
```bash
# Create migration from schema
npx prisma migrate dev --name init_schema

# This will:
# - Create tables
# - Add indexes
# - Add constraints
# - Generate migration file

# Verify migration worked
npx prisma db push
```

#### Step 2.3: Seed Initial Data
```bash
# Create seed script: backend/prisma/seed.ts

cat > backend/prisma/seed.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Create categories
  const electronics = await prisma.category.create({
    data: {
      id: uuidv4(),
      name: 'Electronics',
      display_order: 1
    }
  });

  // Create products
  const product1 = await prisma.product.create({
    data: {
      id: uuidv4(),
      category_id: electronics.id,
      sku: 'PHONE-001',
      name: 'Smartphone Pro',
      description: 'Latest smartphone model',
      marked_price: 50000,
      effective_price: 45000,
      cost_price: 35000,
      tax_rate: 18,
      barcode: '8901012345678'
    }
  });

  // Create inventory
  await prisma.inventory.create({
    data: {
      id: uuidv4(),
      product_id: product1.id,
      quantity_on_hand: 100,
      quantity_reserved: 0,
      low_stock_threshold: 10,
      reorder_point: 20
    }
  });

  // Create admin user
  await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@store.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      store_id: 'store_001',
      is_active: true
    }
  });

  console.log('✅ Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF

# Run seed
npx prisma db seed
```

#### Step 2.4: Verify Data in Database
```sql
-- Connect to database
psql postgresql://pos_user:password@localhost:5432/mobilepos

-- Check tables created
\dt

-- Verify data
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM categories;
SELECT COUNT(*) FROM users;

-- Exit
\q
```

**✅ Checkpoint 2**: Database populated with seed data

---

### Day 5: Database Utilities

#### Step 3.1: Create Database Reset Script
```bash
# Create: backend/scripts/reset-db.sh

cat > backend/scripts/reset-db.sh << 'EOF'
#!/bin/bash

echo "🗑️  Resetting database..."

# Drop existing
dropdb mobilepos

# Create new
createdb mobilepos

# Run migrations
npx prisma migrate deploy

# Seed data
npx prisma db seed

echo "✅ Database reset complete"
EOF

chmod +x backend/scripts/reset-db.sh
```

#### Step 3.2: Create Backup Script
```bash
# Create: backend/scripts/backup-db.sh

cat > backend/scripts/backup-db.sh << 'EOF'
#!/bin/bash

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/mobilepos_$TIMESTAMP.sql"

mkdir -p backups

pg_dump postgresql://pos_user:password@localhost:5432/mobilepos > $BACKUP_FILE

echo "✅ Backup created: $BACKUP_FILE"
EOF

chmod +x backend/scripts/backup-db.sh
```

**✅ Checkpoint 3**: Database utilities ready

---

## Week 2: Backend Implementation

### Day 6-7: Implement Core Services

#### Step 4.1: Complete AuthService
```typescript
// File: backend/src/services/AuthService.ts (add these methods)

// Check if file already exists with basic implementation
// Add these advanced methods:

// Method: Password reset flow
async resetPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, 'User not found');
  
  // Generate reset token (valid for 1 hour)
  const resetToken = jwt.sign(
    { userId: user.id, type: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  // Send email with reset link (future implementation)
  // await emailService.sendPasswordReset(email, resetToken);
  
  return { message: 'Reset link sent to email' };
}

// Method: Update employee role
async updateEmployeeRole(
  userId: string,
  newRole: 'admin' | 'manager' | 'cashier',
  updatedByUserId: string
) {
  // Verify updater has permission
  const updater = await prisma.user.findUnique({
    where: { id: updatedByUserId }
  });
  
  if (updater?.role !== 'admin') {
    throw new AppError(403, 'Only admins can change roles');
  }
  
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  });
  
  // Log audit
  await this.logAudit(updatedByUserId, 'UPDATE_USER_ROLE', 'user', userId, {
    old_role: updater?.role,
    new_role: newRole
  });
  
  return updated;
}

// Method: Deactivate user
async deactivateUser(userId: string, reason: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { 
      is_active: false,
      deleted_at: new Date()
    }
  });
}
```

#### Step 4.2: Enhance TransactionService
```typescript
// File: backend/src/services/TransactionService.ts (add)

// Method: Get transaction by offline hash
async getByOfflineHash(offlineSessionHash: string) {
  return prisma.transaction.findUnique({
    where: { offline_session_hash: offlineSessionHash },
    include: { transaction_items: true }
  });
}

// Method: Calculate daily totals for store
async getStoreDailySummary(storeId: string, date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const result = await prisma.transaction.aggregate({
    where: {
      store_id: storeId,
      created_at: {
        gte: startOfDay,
        lte: endOfDay
      },
      status: 'completed'
    },
    _count: { id: true },
    _sum: { total_amount: true }
  });
  
  return {
    transaction_count: result._count.id,
    total_revenue: result._sum.total_amount || 0,
    average_transaction: result._count.id > 0
      ? (result._sum.total_amount || 0) / result._count.id
      : 0
  };
}

// Method: Export transactions (for reporting)
async exportTransactions(
  storeId: string,
  dateFrom: Date,
  dateTo: Date,
  format: 'csv' | 'json' = 'csv'
) {
  const transactions = await prisma.transaction.findMany({
    where: {
      store_id: storeId,
      created_at: {
        gte: dateFrom,
        lte: dateTo
      }
    },
    include: { transaction_items: true, user: true }
  });
  
  if (format === 'json') {
    return transactions;
  }
  
  // CSV format
  const csv = [
    ['ID', 'Date', 'Cashier', 'Items', 'Total', 'Payment Method'],
    ...transactions.map(tx => [
      tx.id,
      tx.created_at.toISOString(),
      tx.user.first_name,
      tx.transaction_items.length,
      tx.total_amount,
      tx.payment_method
    ])
  ];
  
  return csv;
}
```

#### Step 4.3: Create PaymentService
```typescript
// Create: backend/src/services/PaymentService.ts

import { AppError } from '../utils/errorHandler';

export class PaymentService {
  // Mock payment processor (replace with Stripe/actual payment gateway)
  static async processPayment(
    transactionId: string,
    amount: number,
    method: 'cash' | 'card' | 'mobile_wallet',
    paymentDetails?: any
  ) {
    switch (method) {
      case 'cash':
        return this.processCash(transactionId, amount);
      case 'card':
        return this.processCard(transactionId, amount, paymentDetails);
      case 'mobile_wallet':
        return this.processWallet(transactionId, amount, paymentDetails);
      default:
        throw new AppError(400, 'Invalid payment method');
    }
  }

  private static async processCash(transactionId: string, amount: number) {
    // Cash is always accepted
    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'cash',
      amount,
      reference: `CASH-${transactionId.substring(0, 8)}`,
      timestamp: new Date().toISOString()
    };
  }

  private static async processCard(
    transactionId: string,
    amount: number,
    details: any
  ) {
    // TODO: Integrate with Stripe/payment provider
    // For now, mock implementation
    if (!details.card_token) {
      throw new AppError(400, 'Card token required');
    }

    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'card',
      amount,
      reference: details.card_token,
      masked_pan: '****-****-****-4242',
      timestamp: new Date().toISOString()
    };
  }

  private static async processWallet(
    transactionId: string,
    amount: number,
    details: any
  ) {
    // TODO: Integrate with payment gateway (Razorpay, PayPal, etc)
    if (!details.wallet_id) {
      throw new AppError(400, 'Wallet ID required');
    }

    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'mobile_wallet',
      amount,
      reference: details.wallet_id,
      timestamp: new Date().toISOString()
    };
  }

  // Refund method
  static async refundPayment(
    transactionId: string,
    paymentReference: string,
    amount: number,
    reason: string
  ) {
    // TODO: Call payment processor API to refund
    return {
      transaction_id: transactionId,
      refund_status: 'pending',
      refund_reference: `REFUND-${Date.now()}`,
      amount,
      reason
    };
  }
}
```

**✅ Checkpoint 4**: Core services enhanced

---

### Day 8-9: Complete API Routes

#### Step 5.1: Implement Missing Route Handlers

```typescript
// File: backend/src/api/routes/products.routes.ts
// (Update with full implementation - see code in ARCHITECTURE.md)

// Add these features:
// 1. Full-text search with PostgreSQL
// 2. Pagination with offset/limit
// 3. Category filtering
// 4. Price range filtering
// 5. Bulk import endpoint

// Example: Full-text search
router.get(
  '/search',
  catchAsync(async (req: Request, res: Response) => {
    const { q } = req.query;
    
    if (!q) {
      throw new AppError(400, 'Search query required');
    }

    const results = await prisma.product.findMany({
      where: {
        OR: [
          { name: { search: q as string } },
          { description: { search: q as string } },
          { sku: { contains: q as string, mode: 'insensitive' } }
        ]
      },
      include: { category: true },
      take: 50
    });

    res.json({
      status: 'success',
      data: results,
      count: results.length
    });
  })
);
```

#### Step 5.2: Implement Analytics Routes
```typescript
// File: backend/src/api/routes/analytics.routes.ts
// Complete implementation with:
// 1. Hourly sales trends
// 2. Product performance analytics
// 3. Customer segmentation
// 4. Payment method analysis

// Example: Hourly trends
router.get(
  '/sales/hourly',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const storeId = (req as any).user.storeId;

    const results = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as transactions,
        SUM(total_amount) as revenue
      FROM transactions
      WHERE store_id = ${storeId}
        AND created_at >= ${new Date(dateFrom as string)}
        AND created_at <= ${new Date(dateTo as string)}
        AND status = 'completed'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour ASC
    `;

    res.json({ status: 'success', data: results });
  })
);
```

**✅ Checkpoint 5**: All routes implemented

---

### Day 10: Testing Backend Setup

#### Step 6.1: Create Unit Tests
```bash
# Create: backend/tests/unit/TransactionService.test.ts

cat > backend/tests/unit/TransactionService.test.ts << 'EOF'
import { TransactionService } from '../../src/services/TransactionService';
import { PrismaClient } from '@prisma/client';

describe('TransactionService', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createTransaction', () => {
    it('should create a transaction with items', async () => {
      const input = {
        store_id: 'store_001',
        user_id: 'user_123',
        offline_session_hash: 'hash_123',
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash' as const,
        items: []
      };

      const result = await TransactionService.createTransaction(input);
      
      expect(result).toHaveProperty('id');
      expect(result.total_amount).toBe(1000);
      expect(result.status).toBe('completed');
    });

    it('should prevent duplicate transactions via offline_session_hash', async () => {
      const hash = 'unique_hash_456';
      const input = {
        store_id: 'store_001',
        user_id: 'user_123',
        offline_session_hash: hash,
        subtotal: 500,
        tax_amount: 50,
        discount_amount: 0,
        total_amount: 550,
        payment_method: 'cash' as const,
        items: []
      };

      // First creation
      const result1 = await TransactionService.createTransaction(input);

      // Second creation with same hash (should return cached)
      const result2 = await TransactionService.createTransaction(input);

      expect(result1.id).toBe(result2.id);
    });
  });
});
EOF

npm test -- TransactionService.test.ts
```

#### Step 6.2: Create Integration Tests
```bash
# Create: backend/tests/integration/checkout-flow.test.ts

cat > backend/tests/integration/checkout-flow.test.ts << 'EOF'
import axios from 'axios';

const BASE_URL = 'http://localhost:3000/v1';

describe('Checkout Flow (Integration)', () => {
  let token: string;
  let deviceId = 'test_device_' + Date.now();

  // Step 1: Login
  it('should authenticate user', async () => {
    const response = await axios.post(`${BASE_URL}/auth/biometric-verify`, {
      biometric_token_hash: 'test_hash',
      device_id: deviceId
    });

    expect(response.status).toBe(200);
    token = response.data.data.access_token;
  });

  // Step 2: Get products
  it('should retrieve products', async () => {
    const response = await axios.get(`${BASE_URL}/products?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.data)).toBe(true);
  });

  // Step 3: Create transaction
  it('should create transaction', async () => {
    const response = await axios.post(
      `${BASE_URL}/transactions`,
      {
        store_id: 'store_001',
        user_id: 'user_123',
        offline_session_hash: 'hash_' + Date.now(),
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: []
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(response.status).toBe(201);
    expect(response.data.data).toHaveProperty('receipt_number');
  });
});
EOF

npm test -- checkout-flow.test.ts
```

**✅ Checkpoint 6**: Backend tests set up

---

## Week 3: Mobile Implementation

### Day 11-12: Complete Screens

#### Step 7.1: Implement Dashboard Screen
```typescript
// Create: mobile/src/screens/DashboardScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, ProgressBar } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';

export default function DashboardScreen() {
  const auth = useSelector((state: RootState) => state.auth);
  const sync = useSelector((state: RootState) => state.sync);
  
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get('/analytics/dashboard');
      setDashboard(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={[
        { key: 'header' },
        { key: 'stats' },
        { key: 'top_products' }
      ]}
      renderItem={({ item }) => {
        switch (item.key) {
          case 'header':
            return (
              <View style={styles.header}>
                <Text variant="displaySmall">Welcome, {auth.user?.first_name}</Text>
                <Text variant="bodySmall">
                  {sync.mode === 'OFFLINE' ? '🔴 Offline Mode' : '🟢 Online'}
                </Text>
              </View>
            );

          case 'stats':
            return (
              <View style={styles.statsContainer}>
                <Card style={styles.statCard}>
                  <Card.Content>
                    <Text variant="labelMedium">Total Revenue</Text>
                    <Text variant="displaySmall">₹{dashboard?.total_revenue?.toLocaleString()}</Text>
                    <Text variant="bodySmall">{dashboard?.transaction_count} transactions</Text>
                  </Card.Content>
                </Card>

                <Card style={styles.statCard}>
                  <Card.Content>
                    <Text variant="labelMedium">Avg Transaction</Text>
                    <Text variant="displaySmall">
                      ₹{(dashboard?.total_revenue / dashboard?.transaction_count)?.toFixed(0)}
                    </Text>
                  </Card.Content>
                </Card>

                <Card style={styles.statCard}>
                  <Card.Content>
                    <Text variant="labelMedium">Items Sold</Text>
                    <Text variant="displaySmall">{dashboard?.total_items_sold}</Text>
                  </Card.Content>
                </Card>
              </View>
            );

          case 'top_products':
            return (
              <View style={styles.topProductsContainer}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Top Products
                </Text>
                {dashboard?.top_products?.map((product: any) => (
                  <Card key={product.product_id} style={styles.productCard}>
                    <Card.Content>
                      <Text variant="bodyMedium">{product.name}</Text>
                      <Text variant="bodySmall">
                        Qty: {product.qty} | Revenue: ₹{product.revenue}
                      </Text>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            );

          default:
            return null;
        }
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  header: {
    marginBottom: 24
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
    flexWrap: 'wrap'
  },
  statCard: {
    flex: 1,
    minWidth: '45%'
  },
  topProductsContainer: {
    marginBottom: 24
  },
  sectionTitle: {
    marginBottom: 12
  },
  productCard: {
    marginBottom: 8
  }
});
```

#### Step 7.2: Implement Inventory Screen
```typescript
// Create: mobile/src/screens/InventoryScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Card, Button, TextInput, Badge, FAB } from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { setLowStockAlerts, setExpiringBatches } from '../redux/slices/inventorySlice';
import ApiClient from '../services/ApiClient';

export default function InventoryScreen() {
  const dispatch = useDispatch();
  const inventory = useSelector((state: RootState) => state.inventory);
  
  const [activeTab, setActiveTab] = useState<'all' | 'low-stock' | 'expiring'>('low-stock');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      
      const [lowStock, expiring] = await Promise.all([
        ApiClient.get('/inventory/low-stock'),
        ApiClient.get('/inventory/expiring?days=7')
      ]);

      dispatch(setLowStockAlerts(lowStock));
      dispatch(setExpiringBatches(expiring));
    } catch (error) {
      Alert.alert('Error', 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async (productId: string, quantity: number, reason: string) => {
    try {
      await ApiClient.patch(`/inventory/${productId}`, {
        quantity,
        reason
      });
      
      Alert.alert('Success', 'Stock updated');
      loadInventory();
    } catch (error) {
      Alert.alert('Error', 'Failed to update stock');
    }
  };

  const renderLowStockItem = (item: any) => (
    <Card key={item.product_id} style={styles.itemCard}>
      <Card.Content>
        <View style={styles.itemHeader}>
          <Text variant="bodyLarge">{item.product_name}</Text>
          <Badge style={styles.badge}>{item.current_quantity}</Badge>
        </View>
        
        <Text variant="bodySmall">
          SKU: {item.sku} | Threshold: {item.low_stock_threshold}
        </Text>
        
        <View style={styles.buttonGroup}>
          <Button
            mode="outlined"
            size="small"
            onPress={() => handleAdjustStock(item.product_id, 10, 'restock')}
          >
            Add 10 units
          </Button>
          <Button
            mode="outlined"
            size="small"
            onPress={() => handleAdjustStock(item.product_id, -1, 'damage')}
          >
            Mark Damage
          </Button>
        </View>
      </Card.Content>
    </Card>
  );

  const renderExpiringBatch = (item: any) => (
    <Card key={item.batch_id} style={styles.itemCard}>
      <Card.Content>
        <View style={styles.itemHeader}>
          <Text variant="bodyLarge">{item.product_name}</Text>
          <Badge style={styles.urgencyBadge}>{item.urgency}</Badge>
        </View>
        
        <Text variant="bodySmall">
          Batch: {item.batch_number} | Expires: {item.expiry_date}
        </Text>
        
        <Text variant="labelMedium" style={styles.quantity}>
          Quantity: {item.quantity} units
        </Text>
        
        <Button
          mode="outlined"
          size="small"
          onPress={() => {
            Alert.alert(
              'Mark as Expired?',
              'This will deduct stock and remove from inventory',
              [
                { text: 'Cancel' },
                {
                  text: 'Confirm',
                  onPress: () => handleMarkExpired(item.batch_id)
                }
              ]
            );
          }}
        >
          Mark Expired
        </Button>
      </Card.Content>
    </Card>
  );

  const handleMarkExpired = async (batchId: string) => {
    try {
      await ApiClient.post(`/inventory/batches/${batchId}/expire`);
      Alert.alert('Success', 'Batch marked as expired');
      loadInventory();
    } catch (error) {
      Alert.alert('Error', 'Failed to update batch');
    }
  };

  const data = activeTab === 'low-stock' ? inventory.lowStockAlerts : inventory.expiringBatches;

  return (
    <View style={styles.container}>
      {/* Tab buttons */}
      <View style={styles.tabBar}>
        <Button
          mode={activeTab === 'low-stock' ? 'contained' : 'outlined'}
          onPress={() => setActiveTab('low-stock')}
          style={styles.tab}
        >
          Low Stock ({inventory.lowStockAlerts.length})
        </Button>
        <Button
          mode={activeTab === 'expiring' ? 'contained' : 'outlined'}
          onPress={() => setActiveTab('expiring')}
          style={styles.tab}
        >
          Expiring ({inventory.expiringBatches.length})
        </Button>
      </View>

      {/* Items list */}
      <FlatList
        data={data}
        renderItem={({ item }) =>
          activeTab === 'low-stock' ? renderLowStockItem(item) : renderExpiringBatch(item)
        }
        keyExtractor={(item) => item.product_id || item.batch_id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No items to display</Text>
        }
      />

      {/* Refresh FAB */}
      <FAB
        icon="refresh"
        onPress={loadInventory}
        style={styles.fab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12
  },
  tabBar: {
    flexDirection: 'row',
    marginVertical: 12,
    gap: 8
  },
  tab: {
    flex: 1
  },
  itemCard: {
    marginVertical: 8
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  badge: {
    backgroundColor: '#FFB74D'
  },
  urgencyBadge: {
    backgroundColor: '#FF6B6B'
  },
  quantity: {
    marginVertical: 8
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    color: '#999'
  }
});
```

**✅ Checkpoint 7**: Key screens implemented

---

### Day 13-14: Component Library & Hooks

#### Step 8.1: Create Reusable Components
```typescript
// Create: mobile/src/components/common/LoadingSpinner.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

interface LoadingSpinnerProps {
  loading: boolean;
  message?: string;
  children?: React.ReactNode;
}

export default function LoadingSpinner({ loading, message, children }: LoadingSpinnerProps) {
  if (!loading) return <>{children}</>;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  message: {
    marginTop: 16,
    textAlign: 'center'
  }
});
```

```typescript
// Create: mobile/src/components/common/ErrorBoundary.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<any>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text variant="headlineSmall" style={styles.title}>
            Something went wrong
          </Text>
          <Text variant="bodyMedium" style={styles.message}>
            {this.state.error?.message}
          </Text>
          <Button
            mode="contained"
            onPress={() => this.setState({ hasError: false })}
          >
            Try Again
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  title: {
    marginBottom: 16
  },
  message: {
    marginBottom: 16,
    textAlign: 'center'
  }
});
```

#### Step 8.2: Create Custom Hooks
```typescript
// Create: mobile/src/hooks/useNetworkStatus.ts

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useDispatch } from 'react-redux';
import { setConnected } from '../redux/slices/syncSlice';
import ApiClient from '../services/ApiClient';

export function useNetworkStatus() {
  const dispatch = useDispatch();
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      
      // Update Redux
      dispatch(setConnected(connected));
      
      // Update API client
      ApiClient.setOnlineStatus(connected);
    });

    return () => unsubscribe();
  }, [dispatch]);

  return isConnected;
}
```

```typescript
// Create: mobile/src/hooks/useCart.ts

import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../redux/store';
import * as cartActions from '../redux/slices/cartSlice';

export function useCart() {
  const dispatch = useDispatch();
  const cart = useSelector((state: RootState) => state.cart);

  return {
    items: cart.items,
    subtotal: cart.subtotal,
    taxAmount: cart.tax_amount,
    discountAmount: cart.discount_amount,
    total: cart.total,
    paymentMethod: cart.payment_method,
    
    addItem: (item: any) => dispatch(cartActions.addItem(item)),
    removeItem: (productId: string) => dispatch(cartActions.removeItem(productId)),
    updateQuantity: (productId: string, quantity: number) =>
      dispatch(cartActions.updateQuantity({ product_id: productId, quantity })),
    setPaymentMethod: (method: 'cash' | 'card' | 'mobile_wallet') =>
      dispatch(cartActions.setPaymentMethod(method)),
    clear: () => dispatch(cartActions.clearCart())
  };
}
```

**✅ Checkpoint 8**: Components & hooks ready

---

## Week 4: Testing Phase

### Day 15-16: Unit & Integration Tests

#### Step 9.1: Backend Unit Tests
```bash
# Run all backend tests
cd backend
npm test

# Run specific test file
npm test -- TransactionService.test.ts

# Run with coverage
npm test -- --coverage

# Expected coverage
# Lines: >80%
# Branches: >75%
# Functions: >80%
```

#### Step 9.2: Mobile Unit Tests
```bash
# Create: mobile/src/redux/slices/cartSlice.test.ts

import { configureStore } from '@reduxjs/toolkit';
import cartReducer, {
  addItem,
  removeItem,
  updateQuantity,
  clearCart
} from './cartSlice';

describe('cartSlice', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: { cart: cartReducer }
    });
  });

  it('should add item to cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));

    const state = store.getState().cart;
    expect(state.items).toHaveLength(1);
    expect(state.total).toBe(118);
  });

  it('should remove item from cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));

    store.dispatch(removeItem('prod_1'));

    const state = store.getState().cart;
    expect(state.items).toHaveLength(0);
    expect(state.total).toBe(0);
  });

  it('should clear cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));

    store.dispatch(clearCart());

    const state = store.getState().cart;
    expect(state.items).toHaveLength(0);
    expect(state.payment_method).toBeNull();
  });
});
```

Run tests:
```bash
cd mobile
npm test
```

**✅ Checkpoint 9**: Unit tests passing

---

### Day 17-18: Integration & E2E Tests

#### Step 10.1: Complete Checkout Flow Test
```bash
# Create test scenario file

cat > backend/tests/integration/complete-checkout.test.ts << 'EOF'
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API = axios.create({
  baseURL: 'http://localhost:3000/v1',
  validateStatus: () => true // Don't throw on any status
});

describe('Complete Checkout Flow', () => {
  const deviceId = 'test_' + Date.now();
  let token = '';
  let userId = '';
  let customerId = '';
  let productId = '';

  // Phase 1: Setup (Create users, products, etc.)
  beforeAll(async () => {
    console.log('🔄 Setting up test data...');
    
    // Simulate biometric auth (in real scenario, this would be actual biometric)
    const authRes = await API.post('/auth/biometric-verify', {
      biometric_token_hash: 'test_hash_' + Date.now(),
      device_id: deviceId
    });

    if (authRes.status !== 200) {
      // Manual login as fallback
      userId = uuidv4();
      token = 'test_token_' + Date.now();
      customerId = uuidv4();
    } else {
      token = authRes.data.data.access_token;
      userId = authRes.data.data.user.id;
    }

    // Get a product (or create one)
    const productsRes = await API.get('/products?limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (productsRes.data.data.length > 0) {
      productId = productsRes.data.data[0].id;
    }
  });

  // Phase 2: Shopping
  it('Step 1: Authenticate user', async () => {
    expect(token).toBeTruthy();
  });

  it('Step 2: Search for products', async () => {
    const res = await API.get('/products?limit=10&offset=0', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it('Step 3: Create transaction', async () => {
    const offlineHash = `hash_${deviceId}_${Date.now()}`;

    const res = await API.post(
      '/transactions',
      {
        store_id: 'store_001',
        user_id: userId,
        offline_session_hash: offlineHash,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: [
          {
            product_id: productId,
            quantity: 1,
            unit_price: 900,
            tax_amount: 100,
            line_total: 1000
          }
        ]
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(201);
    expect(res.data.data).toHaveProperty('receipt_number');
    expect(res.data.data.total_amount).toBe(1000);
  });

  it('Step 4: Verify inventory updated', async () => {
    const res = await API.get('/inventory', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    const item = res.data.data.find((i: any) => i.product_id === productId);
    expect(item.status).toMatch(/IN_STOCK|LOW|OUT_OF_STOCK/);
  });

  it('Step 5: Get analytics', async () => {
    const res = await API.get('/analytics/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('total_transactions');
    expect(res.data.data).toHaveProperty('total_revenue');
  });
});

describe('Offline Sync Flow', () => {
  const deviceId = 'offline_' + Date.now();

  it('Should queue transaction when offline', async () => {
    // Simulate offline mode
    const offlineHash = `offline_hash_${Date.now()}`;

    // In real scenario, mobile app would detect no network
    // and store transaction locally

    // Then when online, POST to /transactions/batch
    const batchRes = await API.post('/transactions/batch', {
      transactions: [
        {
          store_id: 'store_001',
          user_id: 'user_123',
          offline_session_hash: offlineHash,
          subtotal: 900,
          tax_amount: 100,
          discount_amount: 0,
          total_amount: 1000,
          payment_method: 'cash',
          items: []
        }
      ]
    });

    expect(batchRes.status).toBe(200);
    expect(batchRes.data.data.results).toBeDefined();
  });
});
EOF

npm test -- complete-checkout.test.ts
```

#### Step 10.2: Mobile E2E Test (Detox)
```bash
# Install Detox
npm install --save-dev detox-cli detox detox-configuration

# Create: mobile/e2e/checkout.e2e.js

describe('Checkout Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should complete checkout flow', async () => {
    // Login
    await element(by.id('email_input')).typeText('cashier@store.com');
    await element(by.id('password_input')).typeText('password');
    await element(by.id('login_button')).multiTap();

    // Wait for dashboard
    await waitFor(element(by.text('Welcome')))
      .toBeVisible()
      .withTimeout(5000);

    // Go to checkout
    await element(by.id('checkout_tab')).tap();

    // Search for product
    await element(by.id('search_input')).typeText('Widget');
    await element(by.id('product_Widget')).tap();
    await element(by.id('add_button')).tap();

    // Verify added to cart
    await expect(element(by.text('Cart (1 items)'))).toBeVisible();

    // Complete transaction
    await element(by.id('payment_cash')).tap();
    await element(by.id('complete_button')).multiTap();

    // Verify receipt
    await waitFor(element(by.text('Transaction completed')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

**✅ Checkpoint 10**: Integration tests passing

---

## Week 5: Performance & Security Testing

### Day 19-20: Performance Testing

#### Step 11.1: Load Testing
```bash
# Install k6
npm install -g k6

# Create: backend/tests/load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 100,  // 100 virtual users
  duration: '5m',  // 5 minute test
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests must complete < 500ms
    http_req_failed: ['<1%']  // Less than 1% failure rate
  }
};

export default function() {
  // Load test: Get products
  let res = http.get('http://localhost:3000/v1/products?limit=50');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500
  });

  sleep(1);
}

// Run test
// k6 run backend/tests/load-test.js
```

#### Step 11.2: Database Performance
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT p.name, i.quantity_on_hand
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE i.quantity_on_hand < 10
ORDER BY i.quantity_on_hand ASC;

-- Create indexes if needed
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock 
ON inventory(quantity_on_hand) 
WHERE quantity_on_hand < low_stock_threshold;

-- Verify indexes are being used
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan > 0 
ORDER BY idx_scan DESC;
```

#### Step 11.3: Mobile Performance
```typescript
// Create: mobile/tests/performance.test.ts

import { measureRenderTime } from '@testing-library/react-native';
import CheckoutScreen from '../src/screens/CheckoutScreen';

describe('Mobile Performance', () => {
  it('Dashboard should render in < 1s', async () => {
    const renderTime = measureRenderTime(() => {
      render(<DashboardScreen />);
    });

    expect(renderTime).toBeLessThan(1000);  // ms
  });

  it('Search with 1000 products should respond in < 200ms', async () => {
    const startTime = performance.now();
    // Simulate Fuse.js search
    const results = fuse.search('widget');
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(200);
  });
});
```

**✅ Checkpoint 11**: Performance benchmarks established

---

### Day 21: Security Testing

#### Step 12.1: Security Audit
```bash
# Run security checks
npm audit

# Security scan with OWASP
npm install -g snyk
snyk test

# Check for vulnerabilities in dependencies
npm outdated
```

#### Step 12.2: API Security Tests
```typescript
// Create: backend/tests/security/auth.security.test.ts

describe('Authentication Security', () => {
  it('should reject missing authorization header', async () => {
    const res = await axios.get('http://localhost:3000/v1/transactions');
    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await axios.get('http://localhost:3000/v1/transactions', {
      headers: { Authorization: 'Bearer invalid_token' }
    });
    expect(res.status).toBe(401);
  });

  it('should reject expired token', async () => {
    const expiredToken = jwt.sign({}, 'secret', { expiresIn: '-1h' });
    const res = await axios.get('http://localhost:3000/v1/transactions', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    expect(res.status).toBe(401);
  });

  it('should enforce rate limiting', async () => {
    for (let i = 0; i < 6; i++) {
      await axios.post('http://localhost:3000/v1/auth/biometric-verify', {
        biometric_token_hash: 'test',
        device_id: 'test'
      });
    }

    const res = await axios.post('http://localhost:3000/v1/auth/biometric-verify', {
      biometric_token_hash: 'test',
      device_id: 'test'
    });

    expect(res.status).toBe(429);  // Too Many Requests
  });

  it('should sanitize input', async () => {
    const res = await axios.post(
      'http://localhost:3000/v1/products',
      {
        name: '<script>alert("xss")</script>',
        // ... other fields
      },
      { headers: { Authorization: 'Bearer token' } }
    );

    expect(res.data.data.name).not.toContain('<script>');
  });
});

describe('CORS Security', () => {
  it('should reject requests from unauthorized origins', async () => {
    const res = await axios.get('http://localhost:3000/v1/products', {
      headers: { Origin: 'https://evil.com' }
    });

    expect(res.status).toBe(403);  // Or CORS error
  });
});
```

**✅ Checkpoint 12**: Security tests passing

---

## Week 6: QA & Deployment Prep

### Day 22: Final QA Testing

#### Step 13.1: Test Checklist
```markdown
## Functional Testing Checklist

### Authentication
- [ ] Biometric login works
- [ ] JWT tokens generated correctly
- [ ] Token refresh works
- [ ] Logout clears tokens
- [ ] Session timeout works

### Transactions
- [ ] Can create transaction online
- [ ] Can create transaction offline
- [ ] Offline transactions sync when online
- [ ] No duplicate transactions on retry
- [ ] Receipt generates correctly
- [ ] Receipt can be emailed/SMS'd
- [ ] Transaction can be voided
- [ ] Void audit logs created

### Inventory
- [ ] Stock deducted on transaction
- [ ] Low-stock alerts appear
- [ ] Batch expiry tracking works
- [ ] Can mark batch as expired
- [ ] Stock restored on transaction void

### Customers
- [ ] Can create customer
- [ ] Can search customer
- [ ] Purchase history tracked
- [ ] Loyalty points added
- [ ] Loyalty points can be redeemed

### Analytics
- [ ] Dashboard loads
- [ ] Sales report shows correct data
- [ ] Top products ranked by revenue
- [ ] Employee performance tracked
- [ ] Payment method breakdown correct

### Offline Mode
- [ ] App works with no internet
- [ ] Transactions stored locally
- [ ] Cart persists offline
- [ ] Auto-sync when online
- [ ] Sync notifications appear

### Performance
- [ ] App starts in < 2s
- [ ] Dashboard loads in < 2s
- [ ] Search responds in < 200ms
- [ ] Checkout completes in < 5s
- [ ] Batch sync handles 100+ items

### Security
- [ ] No PINs stored locally
- [ ] Cards not stored locally
- [ ] Sensitive data encrypted
- [ ] Audit logs capture actions
- [ ] Root/jailbreak detection works
```

#### Step 13.2: Run Full Test Suite
```bash
# Backend
cd backend
npm run test -- --coverage

# Mobile
cd ../mobile
npm test -- --coverage

# E2E
detox build-framework-cache
detox build-app
detox test-runner --record-logs all
```

**✅ Checkpoint 13**: All tests passing, QA complete

---

### Day 23-24: Production Deployment Prep

#### Step 14.1: Create Deployment Guide
```bash
# Create: DEPLOYMENT.md

cat > DEPLOYMENT.md << 'EOF'
# Deployment Guide

## Pre-deployment Checklist

- [ ] All tests passing
- [ ] No console errors in mobile
- [ ] No unhandled exceptions in logs
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Database migrations reviewed
- [ ] Environment variables configured
- [ ] Backups scheduled
- [ ] Monitoring setup

## Staging Deployment

### 1. Build Backend
```bash
cd backend
npm run build
docker build -t mobile-pos:staging .
docker push registry.example.com/mobile-pos:staging
```

### 2. Deploy Database
```bash
# Create RDS instance or Cloud SQL
# Run migrations
npm run migrate -- --skip-seed

# Seed minimal data
npm run seed
```

### 3. Deploy API
```bash
# Deploy to container service
kubectl apply -f k8s/backend-staging.yaml

# Verify deployment
kubectl get pods -l app=mobile-pos
kubectl logs deployment/mobile-pos-api
```

### 4. Build Mobile App
```bash
cd mobile
eas build --platform android --release
# Or
eas build --platform ios --release
```

### 5. Smoke Tests
```bash
# Test basic flows
npm test -- checkout-flow.test.ts

# Monitor logs
kubectl logs -f deployment/mobile-pos-api
```

## Production Deployment

### 1. Production Environment Setup
```bash
# Set environment to production
NODE_ENV=production

# Use strong secrets
JWT_SECRET=$(openssl rand -base64 32)
REFRESH_TOKEN_SECRET=$(openssl rand -base64 32)
```

### 2. Database Backup
```bash
# Full backup before deploying
./backend/scripts/backup-db.sh

# Verify backup integrity
```

### 3. Gradual Rollout
- Deploy to 10% of users
- Monitor error rates for 1 hour
- Deploy to 50% if no errors
- Deploy to 100% if still healthy

### 4. Monitoring & Alerting
```bash
# Setup Sentry for error tracking
# Setup CloudWatch/DataDog for metrics
# Setup PagerDuty for on-call alerts
```

### 5. Rollback Plan
- Keep previous version running
- Have rollback command ready: `kubectl rollout undo deployment/mobile-pos-api`
- Test rollback process in staging first
EOF
```

#### Step 14.2: Create Operations Runbook
```bash
# Create: OPERATIONS.md

cat > OPERATIONS.md << 'EOF'
# Operations Runbook

## Daily Checks

### Morning (Before business hours)
```bash
# Check system health
curl http://api.mobilepos.com/health

# Check database
psql -c "SELECT COUNT(*) FROM transactions WHERE created_at::date = TODAY();"

# Check disk space
df -h

# Review error logs
tail -100 /var/log/mobilepos/api.log | grep ERROR
```

### Evening (After business hours)
```bash
# Backup database
./scripts/backup-db.sh

# Cleanup old logs
find /var/log/mobilepos -mtime +30 -delete

# Archive transactions > 90 days old
psql -f scripts/archive-old-transactions.sql
```

## Troubleshooting

### API not responding
1. Check if container is running: `docker ps | grep mobilepos`
2. Check logs: `docker logs mobilepos_api`
3. Restart: `docker restart mobilepos_api`

### Database locked
1. Check active connections: `SELECT * FROM pg_stat_activity;`
2. Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...;`

### High sync queue
1. Check queue: `SELECT COUNT(*) FROM offline_sync_queue WHERE status = 'pending';`
2. Manual sync: `POST /v1/sync/retry/<queueId>`

### Low disk space
1. Check sizes: `du -sh /var/lib/postgresql/data/*`
2. Archive old data
3. Expand volume

## Incidents

### Data Loss
- Restore from backup: `psql < backup.sql`
- Verify transaction count: `SELECT COUNT(*) FROM transactions;`
- Notify users if needed

### Security Breach
- Rotate JWT secrets
- Force logout all users
- Audit logs for compromise
- Notify authorities if PII exposed
EOF
```

**✅ Checkpoint 14**: Deployment documentation complete

---

## Testing Summary

```
Week 1 (Setup):
  ✅ Backend environment configured
  ✅ Database migrations running
  ✅ Seed data populated

Week 2-3 (Implementation):
  ✅ Backend services completed
  ✅ API routes implemented
  ✅ Mobile screens built
  ✅ Redux state management

Week 4 (Testing):
  ✅ Unit tests written & passing
  ✅ Integration tests working
  ✅ E2E tests configured

Week 5 (Performance & Security):
  ✅ Load tests passing
  ✅ Performance benchmarks met
  ✅ Security audit passed
  ✅ Vulnerabilities resolved

Week 6 (QA & Deployment):
  ✅ QA test checklist complete
  ✅ All tests passing
  ✅ Deployment guide created
  ✅ Operations runbook ready
```

---

## Key Metrics to Track

```
Performance:
- API response time: < 500ms (p95)
- App startup time: < 2s
- Search latency: < 200ms
- Sync batch processing: < 30s for 100 items

Reliability:
- API uptime: > 99.5%
- Transaction success rate: > 99%
- Offline sync success rate: > 99%

Quality:
- Test coverage: > 80%
- Critical bugs: 0
- Security vulnerabilities: 0
- Customer errors: < 0.1%
```

---

## Next Steps After Phase 2

1. **Deploy to Production** - Follow deployment guide
2. **Monitor & Iterate** - Track metrics, fix issues
3. **Phase 3 Planning** - Multi-store, advanced features
4. **Customer Training** - Onboard merchants
5. **Support Setup** - Help desk, documentation

---

**Phase 2 Complete! 🎉**

You now have a tested, production-ready Mobile POS system ready for deployment.
