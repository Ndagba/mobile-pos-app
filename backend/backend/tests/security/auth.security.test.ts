import axios from 'axios';
import jwt from 'jsonwebtoken';

const API_URL = 'http://localhost:3000/v1';

const client = axios.create({
  validateStatus: () => true // don't throw on any status
});

describe('Authentication Security', () => {
  it('should reject missing authorization header', async () => {
    const res = await client.get(`${API_URL}/transactions`);
    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await client.get(`${API_URL}/transactions`, {
      headers: { Authorization: 'Bearer invalid_token' }
    });
    expect(res.status).toBe(401);
  });

  it('should reject expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'test', email: 'test@test.com', role: 'cashier' },
      'secret',
      { expiresIn: '-1h' }
    );
    const res = await client.get(`${API_URL}/transactions`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    expect(res.status).toBe(401);
  });

  it('should reject token signed with wrong secret', async () => {
    const fakeToken = jwt.sign(
      { userId: 'hacker', email: 'hacker@evil.com', role: 'admin' },
      'wrong_secret',
      { expiresIn: '24h' }
    );
    const res = await client.get(`${API_URL}/transactions`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    expect(res.status).toBe(401);
  });

  it('should enforce rate limiting on auth endpoint', async () => {
    // Auth limiter allows 5 failed requests per 15 min
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        client.post(`${API_URL}/auth/biometric-verify`, {
          biometric_token_hash: `wrong_hash_${i}`,
          device_id: `wrong_device_${i}`
        })
      );
    }
    const responses = await Promise.all(requests);
    const rateLimited = responses.some((r) => r.status === 429);
    expect(rateLimited).toBe(true);
  });

  it('should reject requests with no bearer prefix', async () => {
    const res = await client.get(`${API_URL}/transactions`, {
      headers: { Authorization: 'notbearer sometoken' }
    });
    expect(res.status).toBe(401);
  });
});

describe('Authorization Security', () => {
  it('should reject cashier accessing admin routes', async () => {
    // Create a cashier token
    const cashierToken = jwt.sign(
      { userId: 'cashier_id', email: 'cashier@store.com', role: 'cashier' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    const res = await client.post(
      `${API_URL}/products`,
      { name: 'Test', sku: 'TEST-001', marked_price: 100, effective_price: 100, category_id: 'cat1' },
      { headers: { Authorization: `Bearer ${cashierToken}` } }
    );
    expect(res.status).toBe(403);
  });
});

describe('Input Validation Security', () => {
  let adminToken = '';

  beforeAll(async () => {
    const authRes = await client.post(`${API_URL}/auth/biometric-verify`, {
      biometric_token_hash: 'test_hash',
      device_id: 'test_device_setup'
    });
    adminToken = authRes.data.data.access_token;
  });

  it('should reject transaction with negative total', async () => {
    const res = await client.post(
      `${API_URL}/transactions`,
      {
        store_id: 'store_001',
        offline_session_hash: `sec_test_${Date.now()}`,
        subtotal: -900,
        tax_amount: -100,
        discount_amount: 0,
        total_amount: -1000,
        payment_method: 'cash',
        items: [{ product_id: 'test', quantity: 1, unit_price: 100, tax_amount: 0, line_total: 100 }]
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should reject invalid payment method', async () => {
    const res = await client.post(
      `${API_URL}/transactions`,
      {
        store_id: 'store_001',
        offline_session_hash: `sec_test2_${Date.now()}`,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'bitcoin',
        items: [{ product_id: 'test', quantity: 1, unit_price: 100, tax_amount: 0, line_total: 100 }]
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('CORS Security', () => {
  it('should not return CORS headers for unauthorized origins', async () => {
    const res = await client.get(`${API_URL}/products`, {
      headers: { Origin: 'https://evil.com' }
    });
    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).not.toBe('https://evil.com');
  });
});