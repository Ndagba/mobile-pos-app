# Production rollout: Phases 0–5 (bar/lounge foundation) on Opalstack

**Same server and method as `DEPLOY_2026-11.md`:** you upload the compiled code with FileZilla (SFTP) and run the database steps over PuTTY (SSH).

**Your live retail store is unaffected:** every store stays `retail` by default, so the bar screens and `/v1/bar/*` stay hidden (they return 404) until you deliberately create a bar store.

## What this release changes for your EXISTING retail store (tell staff first)
- **Cashiers see only their own sales** in sales history (D1).
- **Voiding a sale is now admin/manager only.**
- Void and refund events now appear in the Audit screen.
- Expenses that don't exist return 404 (not found) instead of 500 (server error).
- **Profit & Loss is admin/manager only**, and a manager sees only their own branches.
- On phones, admins and managers find Profit & Loss, Inventory Turnover, Batches and (admin) Expenses under **Settings → Reports & tools**. Admins also get an Expenses shortcut on the Customers screen. This needs the new APK.

Nothing else changes for retail: selling, stock, reports and P&L work as before.

## What it adds
- **8 migrations**, every one strictly additive:
  - `20261102` should already be applied in production.
  - `20261106` adds the `cost_price` column.
  - `20261116` adds the expenses and service-component tables.
  - `20261117` → `20261121` are the five bar/lounge migrations.
- **No new npm packages and no new environment variables.**

---

## Step 0 — Build from your working folder, once everything is committed
The production build is compiled from whatever is in `backend\src`, committed or not. So first make sure there is no uncommitted source code:

```bash
cd C:\Projects\MobilePOS
git status --short backend/src backend/prisma mobile/src shared/src
```

That command must print **nothing**. (The modified `.env` files don't matter: they are never uploaded.) Then tag the release, push it as an off-machine backup, and build:

```bash
git tag release-2026-11-bar
git push origin develop release-2026-11-bar
cd backend
npm run build
```

Upload only `backend\dist\` and `backend\prisma\` (with all migration folders). Do **not** upload `.env`, `node_modules`, `src` or `package.json`.

This release also includes the P&L access check: the P&L endpoints (`/v1/financials/*`) are now admin/manager only, and only for branches the user may access (a manager: their home and assigned branches).

## Step 1 — Read-only diagnosis (PuTTY, app still running)
```bash
cd /home/pcnexamdistro/apps/pcnexamdistro/myproject
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//')"
psql "$DATABASE_URL" -c "SELECT 1;"
cp -r dist "dist_backup_$(date +%F_%H%M)"; cp prisma/schema.prisma "prisma/schema.prisma.bak_$(date +%F_%H%M)"
psql "$DATABASE_URL" -c 'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at;'
# Did 20261106 / 20261116 already land by hand (raw ALTER on 6 Nov, or db push)?
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='TransactionItem' AND column_name='cost_price';"
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Expense','ExpenseCategory','ServiceComponent') ORDER BY 1;"
# None of the bar tables may exist yet (expect 0 rows):
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('BarOrder','CashierLedgerEntry','BarDayClose','CommissionRun');"
```

Use the results to decide what to do with each migration:

| What you see | What to do with it |
|---|---|
| `cost_price` present but `20261106` **not** in the history | Mark it applied (Step 3a). Do **not** run it. |
| `cost_price` absent | Let `migrate deploy` run it. |
| **All 3** of Expense, ExpenseCategory and ServiceComponent exist, and `20261116` is not in the history | Mark it applied (Step 3a). |
| **None** of the 3 exist | Let `migrate deploy` run it. |
| **Some** of the 3 exist | **STOP.** The migration was partly applied. Run only its missing statements by hand, then mark it applied. Get help with this before continuing. |
| Any bar table already exists | **STOP** and investigate. |

## Step 2 — Upload
1. In FileZilla, upload `dist\` and `prisma\` over the copies on the server. This is safe while the app is running.
2. Run `node_modules/.bin/prisma migrate status --schema prisma/schema.prisma` and check that only the migrations you expect are listed as pending.

## Step 3 — Maintenance window (~5 minutes, low-traffic time)
```bash
~/apps/pcnexamdistro/stop
pg_dump "$DATABASE_URL" -Fc -f ~/pos_backup_$(date +%Y%m%d_%H%M%S).dump && ls -lh ~/pos_backup_*.dump   # must be non-zero
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM \"Product\") p,(SELECT count(*) FROM \"Transaction\") t,(SELECT count(*) FROM \"TransactionItem\") ti,(SELECT count(*) FROM \"Inventory\") i;"   # WRITE THESE DOWN
# 3a) only for migrations Step 1 said were already in place:
node_modules/.bin/prisma migrate resolve --applied 20261106000000_add_transactionitem_cost_price --schema prisma/schema.prisma
node_modules/.bin/prisma migrate resolve --applied 20261116000000_add_expenses_and_service_components --schema prisma/schema.prisma
# 3b) apply the rest
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
# 3c) confirm the database now matches the schema exactly
node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script   # expect "empty migration"
node_modules/.bin/prisma generate --schema prisma/schema.prisma
~/apps/pcnexamdistro/stop; sleep 2; ~/apps/pcnexamdistro/start     # fresh process after generate (keepalive cron!)
```

## Step 4 — Verify
1. `curl -s https://distro.pcnigeria.org.ng/health` should return ok.
2. Re-run the row-count query from Step 3. The four counts must be **identical** to the ones you wrote down.
3. Run `curl -s -o /dev/null -w "%{http_code}\n" https://distro.pcnigeria.org.ng/v1/bar/orders/mine`. It should return **401** (the endpoint exists but needs a login), not 404 (the endpoint is missing).
4. Run `psql "$DATABASE_URL" -c "SELECT id, business_mode FROM \"Store\";"`. Every store must show `retail`.
5. In the app:
   - make a **test sale** as a cashier
   - confirm the cashier's history shows only their own sales
   - confirm a manager can see everyone's sales
6. Run `tail -n 40 ~/logs/apps/pcnexamdistro/logfile.log` and check there are no Prisma errors.
7. Optional, harmless: run `node dist/scripts/backfillBarLedger.js`. It's a dry run and should report 0, because there are no bar orders yet.

## Step 5 — Rollback, if a check fails
- **Preferred: roll back the code only.** The migrations only add things, so the old code still runs against the new database, and no sales are lost:
  ```bash
  ~/apps/pcnexamdistro/stop
  rm -rf dist && cp -r dist_backup_<stamp> dist
  cp prisma/schema.prisma.bak_<stamp> prisma/schema.prisma
  node_modules/.bin/prisma generate --schema prisma/schema.prisma
  ~/apps/pcnexamdistro/start
  ```
- **Restore the database from the dump only if a migration itself broke data.** This loses any sales made after the backup:
  ```bash
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/pos_backup_<stamp>.dump
  ```

## Step 6 — Mobile APK (later, optional)
- The app your clients already have keeps working against the updated backend.
- When you ship the new APK:
  - build it with **EAS** after `git status --short mobile/src shared/src` prints nothing
  - bump `version` / `versionCode` in `app.json`
  - sign it with the **same key** as the current app
- The bar screens stay hidden in retail stores.

## Step 7 — First bar pilot (separate, later)
- **Don't switch your existing retail store to bar mode.** A store's mode locks after its first sale, and switching would change how its cashiers work.
- Instead, as super-admin, create a **new store** with `business_mode: "bar"`.
- Set it up in Bar / Lounge setup: assign each cashier a Bar Controller or Attendant profile, and set the business day and commission.
- Then run the pilot there.
