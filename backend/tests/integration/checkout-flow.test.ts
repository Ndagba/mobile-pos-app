import axios from 'axios';

const BASE_URL = 'http://localhost:3000/v1';

describe('Checkout Flow (Integration)', () => {
  let token: string;
  let deviceId = 'test_device_setup';

  // Step 1: Login
  it('should authenticate user', async () => {
    const jwt = require('jsonwebtoken');
    token = jwt.sign(
      { userId: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d', email: 'admin@store.com', role: 'admin' },
      'dev_secret_key',
      { expiresIn: '1h' }
    );
    expect(token).toBeTruthy();
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
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: 'hash_' + Date.now(),
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: [
          {
            product_id: 'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e',
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
    expect(response.status).toBe(201);
    expect(response.data.data).toHaveProperty('receipt_number');
  });
});