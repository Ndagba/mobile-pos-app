# MobilePOS Onboarding Guide
## Welcome to MobilePOS! 🎉

This guide helps you get started quickly.

---

## Step 1: First Login

Your system administrator will provide:
- **Biometric token** — registered on your device
- **Store ID** — your unique store identifier
- **Role** — admin, manager, or cashier

### Admin Default Account
- Email: `admin@store.com`
- First login: set your biometric token via Settings

---

## Step 2: Set Up Your Store

### Add Product Categories
1. Go to **Inventory** → **Categories**
2. Click **Add Category**
3. Enter category name (e.g. Electronics, Food, Clothing)
4. Set display order

### Add Products
1. Go to **Inventory** → **Products**
2. Click **Add Product**
3. Fill in:
   - Product name
   - SKU (unique code)
   - Barcode (optional)
   - Category
   - Selling price
   - Cost price
   - Tax rate

### Set Stock Levels
1. Go to **Inventory** → **Stock**
2. Set initial quantity for each product
3. Set low stock threshold (e.g. 10 units)
4. Set reorder point (e.g. 20 units)

---

## Step 3: Add Staff

### Register a Cashier
Send a POST request to the API or use the admin panel:
- **Endpoint:** `POST /v1/auth/register`
- **Fields:** email, first_name, last_name, role, store_id

### Roles
| Role | Permissions |
|------|-------------|
| Admin | Full access — products, users, reports |
| Manager | Transactions, inventory, reports |
| Cashier | Checkout only |

---

## Step 4: Process Your First Sale

1. Open the **Checkout** screen
2. Search for a product by name or scan barcode
3. Tap product to add to cart
4. Adjust quantity if needed
5. Select payment method (Cash / Card / Mobile Wallet)
6. Tap **Complete Transaction**
7. Receipt is generated automatically

---

## Step 5: View Reports

Go to **Analytics** → **Dashboard** to see:
- Today's revenue
- Number of transactions
- Top selling products
- Items sold

For detailed reports go to **Analytics** → **Sales Report** and select a date range.

---

## Daily Operations

### Start of Day
- Verify system is online (green indicator)
- Check low stock alerts
- Review previous day's summary

### End of Day
- Review daily sales report
- Check for pending offline sync
- Verify cash drawer matches system total

---

## Offline Mode

The app works without internet:
- Transactions are saved locally
- A 🔴 indicator shows offline mode
- When internet returns, transactions sync automatically
- Check **Sync Status** to confirm all transactions uploaded

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't login | Check biometric token is registered |
| Transaction fails | Check internet or switch to offline mode |
| Product not found | Add product to inventory first |
| Stock shows wrong | Run manual stock adjustment |
| App is slow | Clear app cache, restart app |

---

## Support Contacts

- **Technical issues:** Contact your system administrator
- **API status:** http://localhost:3001/health
- **Database admin:** http://localhost:5050 (pgAdmin)

---

## Quick Reference

| Action | How |
|--------|-----|
| Add product | Inventory → Products → Add |
| Process sale | Checkout → Search → Add → Pay |
| View reports | Analytics → Dashboard |
| Adjust stock | Inventory → Stock → Adjust |
| Add staff | Admin → Users → Register |
| View audit log | Admin → Audit Log |
