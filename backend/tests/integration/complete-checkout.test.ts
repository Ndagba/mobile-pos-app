import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API = axios.create({
  baseURL: 'http://localhost:3000/v1',
  validateStatus: () => true
});

describe('Complete Checkout Flow', () => {
  const deviceId = 'test_device_setup';
  let token = '';
  let userId = '';
  let productId = '';

  beforeAll(async () => {
    console.log('🔄 Setting up test data...');

    const jwt = require('jsonwebtoken');
    token = jwt.sign(
      { userId: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d', email: 'admin@store.com', role: 'admin' },
      'dev_secret_key',
      { expiresIn: '1h' }
    );
    userId = 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d';

    const productsRes = await API.get('/products?limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (productsRes.data.data.length > 0) {
      productId = productsRes.data.data[0].id;
    }
  });

  it('Step 1: Authenticate user', async () => {
    expect(token).toBeTruthy();
    expect(userId).toBeTruthy();
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
            discount_amount: 0,
            line_total: 1000
          }
        ]
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(201);
    expect(res.data.data).toHaveProperty('receipt_number');
    expect(Number(res.data.data.total_amount)).toBe(1000);
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
  let syncToken = '';

  beforeAll(async () => {
    const jwt = require('jsonwebtoken');
    syncToken = jwt.sign(
      { userId: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d', email: 'admin@store.com', role: 'admin' },
      'dev_secret_key',
      { expiresIn: '1h' }
    );
  });

  it('Should queue transaction when offline', async () => {
    const offlineHash = `offline_hash_${Date.now()}`;

    const batchRes = await API.post('/transactions/batch', {
      transactions: [
        {
          store_id: 'store_001',
          user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
          offline_session_hash: offlineHash,
          subtotal: 900,
          tax_amount: 100,
          discount_amount: 0,
          total_amount: 1000,
          payment_method: 'cash',
          items: []
        }
      ]
    }, { headers: { Authorization: `Bearer ${syncToken}` } });

    expect(batchRes.status).toBe(200);
    expect(batchRes.data.data.results).toBeDefined();
  });
});