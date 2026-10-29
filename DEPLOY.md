# MobilePOS — Production Deployment Runbook

**Server:** Opalstack · app root `/home/pcnexamdistro/apps/pcnexamdistro/myproject/`
**Deploy method:** FileZilla (SFTP) upload of compiled output + PuTTY (SSH) for DB/migration/restart
**Database:** Opalstack PostgreSQL (`pg_dump` available on the shell)
**Public API:** `https://distro.pcnigeria.org.ng/v1` (health at `/health`)

> Do this during a low-traffic window and warn clients of a **~2–3 minute** planned pause.
> If any command output looks unexpected, **STOP** and review before continuing.

---

## What this deploy contains

| Item | Risk | Mitigation |
|---|---|---|
| `Product.item_type` column added (default `'PRODUCT'`) | None — additive | Existing products auto-classify as PRODUCT |
| `BigInt/Int → Decimal(15,4)` on quantity columns | Table rewrite (brief lock) | Explicit `USING ::DECIMAL` casts preserve every value exactly; run while app is stopped |
| Updated route/service code | Serves old data fine | Uploaded over old `dist/`; old copy kept for instant rollback |
| Dependencies | — | `package.json` unchanged → **no `npm install`** |

**Pending migration:** `prisma/migrations/20260819000000_add_product_services_and_decimal_inventory`
It performs only `ADD COLUMN` + type-widening `ALTER COLUMN ... USING ::DECIMAL`. **No `DROP`, `DELETE`, rename, or table recreation.**

**Three hard gates:** (1) full DB backup before migrating · (2) confirm Prisma migration history is in sync **before** applying · (3) regenerate the Prisma client on the server after.

---

## Step 1 — Build & assemble (on the PC)

Already built and verified (`npm run build`, exit 0). Upload set from `backend\`:

- `dist\`   → server `.../myproject/dist/`
- `prisma\` → server `.../myproject/prisma/` (schema + all migrations, incl. the new one)

**Do NOT upload:** `node_modules`, `.env`, `src`, `package.json`.

If you change backend code later, rebuild first:

```bash
cd backend && npm run build
```

---

## Step 2 — Server prep + safety check (PuTTY, app still running — no downtime)

```bash
cd /home/pcnexamdistro/apps/pcnexamdistro/myproject
# `tr -d '\r'` strips Windows CRLF endings; sed strips surrounding quotes.
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//')"
echo "$DATABASE_URL" | sed -E 's#(://[^:]+:)[^@]+@#\1****@#'   # verify: must end at db name, no trailing " or %22
psql "$DATABASE_URL" -c "SELECT 1;"                            # connectivity sanity check
```

Back up the current **code** (instant rollback; originals stay in place):

```bash
cp -r dist "dist_backup_$(date +%F_%H%M)"
cp prisma/schema.prisma "prisma/schema.prisma.bak_$(date +%F_%H%M)"
ls -d dist_backup_* && echo "code backup OK"
```

**Read-only diagnosis — decides the apply path.**

> ⚠️ Don't rely on `prisma migrate status` at this stage. The new migration files
> aren't uploaded yet (that's Step 3), so it prints *"No migration found in
> prisma/migrations"* / *"Database schema is up to date!"* — both meaningless here
> (it compares against an empty local folder, not your DB). Use the SQL checks below;
> they read the live database directly and are all read-only.

```bash
node_modules/.bin/prisma -v || echo ">>> PRISMA CLI MISSING"
psql "$DATABASE_URL" -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;'
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name='item_type';"
psql "$DATABASE_URL" -c "SELECT data_type FROM information_schema.columns WHERE table_name='Inventory' AND column_name='quantity_on_hand';"
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Product','Inventory','Branch','TransactionItem') ORDER BY table_name;"
```

| `_prisma_migrations` (check 1) | `item_type` (check 2) | `quantity_on_hand` type (check 3) | Apply path (Step 4) |
|---|---|---|---|
| Errors `does not exist`, **or** 0 rows | absent (0 rows) | `bigint`/`integer` | **Path B** — baseline the 4 old migrations `--applied`, then `migrate deploy` |
| Lists only the **4 old** migrations as finished | absent (0 rows) | `bigint`/`integer` | **Path A** — `migrate deploy` |
| Lists `20260819…`, **or** item_type present, **or** type is `numeric` | — | — | **STOP** — new migration already applied; investigate before touching anything |
| `PRISMA CLI MISSING` | — | — | `npm install prisma@^5.7.0 --no-save`, re-check |

Check 4 just confirms the live DB already contains `Branch`/`Product`/`Inventory`/`TransactionItem` — i.e. the 4 old migrations' effects are already present, which is *why* Path B baselines them as applied instead of re-running them.

### Confirmed state on this server (diagnosed 2026-08-21)

Diagnosis found:

- `_prisma_migrations` **exists**; `20260512115323_init`, `20260513000000_add_branches`, and `20260517094529_add_payments_and_credit_limit` are cleanly applied.
- `20260724115604_add_manager_branches` has **3 rows**: two early attempts from 2026-07-24 that were **marked rolled back** (`rolled_back_at` set, `finished_at` empty) and a third that **finished** at `15:03:54`. All 7 of its tables exist → the migration *is* applied. Because the two unfinished rows are *rolled back* (not empty/empty), Prisma does **not** count them as failed → **no P3009, no repair required.**
- `item_type` absent · `Inventory.quantity_on_hand` still `bigint` → the new migration has **not** run.

→ **Chosen path: plain Path A.** Migrations 1–4 are already tracked and the history is deploy-safe as-is; only `20260819…` is pending. No baselining, no history edits — just upload (Step 3), then `migrate deploy` (Step 4).

---

## Step 3 — Upload new code (FileZilla)

Upload `backend\dist\` and `backend\prisma\` over the server copies under `.../myproject/`.
Overwriting while the app runs is safe — the live process holds old code in memory. **Nothing is live yet.**

> Upload the **entire** `prisma\` folder, including `prisma\migrations\` with all **5** migration subfolders (the server's `migrations/` is currently empty — that's why `migrate status` said *"No migration found"*). Uploading just `schema.prisma` is not enough.

**After the upload — still read-only, app still up — confirm the files landed and the history lines up (final gate before the window):**

```bash
ls prisma/migrations/20260819000000_add_product_services_and_decimal_inventory/migration.sql
node_modules/.bin/prisma migrate status --schema prisma/schema.prisma
```

> **Always pass `--schema prisma/schema.prisma`.** This server has a stale legacy `schema.prisma` at the app root (no `item_type`); a *bare* command reads that one and misleadingly prints *"No migration found in prisma/migrations"* / *"Database schema is up to date."*

`migrate status --schema prisma/schema.prisma` should report **exactly 1 migration not yet applied: `20260819000000_add_product_services_and_decimal_inventory`** (the 4 older ones applied, no failed-migration error). That is the green light for Step 4. If it lists more than one pending, reports a **failed** migration, or warns that already-applied migrations were **modified**, **STOP** and re-check before touching anything.

---

## Step 4 — Maintenance window (PuTTY)

> **Every Prisma command below uses `--schema prisma/schema.prisma`** (the new schema next to the migrations folder). The `$DATABASE_URL` export is repeated in case this is a fresh PuTTY session. Only **step 3** below writes to the database — and only after the backup in step 2.

**1) Set env + stop the app:**

```bash
cd /home/pcnexamdistro/apps/pcnexamdistro/myproject
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//')"
psql "$DATABASE_URL" -c "SELECT 1;"          # env sanity — must return 1
~/apps/pcnexamdistro/stop                    # expect: "Stopped pcnexamdistro."
```

**2) Authoritative DB backup (nothing writes once the app is stopped) + baseline row counts:**

```bash
pg_dump "$DATABASE_URL" -Fc -f ~/pos_backup_$(date +%Y%m%d_%H%M%S).dump
ls -lh ~/pos_backup_*.dump    # confirm non-zero size — DO NOT proceed if this failed
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM \"Product\") AS products, (SELECT count(*) FROM \"Transaction\") AS transactions, (SELECT count(*) FROM \"TransactionItem\") AS tx_items, (SELECT count(*) FROM \"Inventory\") AS inventory;"
```

**Write down those 4 counts** — Step 5 must match them exactly.

**3) Apply the migration** — confirmed path: plain Path A (history is deploy-safe; see Step 2):

```bash
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Expected: **1 migration applied** — `20260819000000_add_product_services_and_decimal_inventory` — and nothing else.

> **Fallback (diagnosis says this won't trigger):** if deploy errors with **P3009 "failed migrations"**, a row has *both* `finished_at` and `rolled_back_at` empty. Mark it rolled back with Prisma's own tool (no raw SQL), then retry:
> ```bash
> psql "$DATABASE_URL" -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NULL;"
> node_modules/.bin/prisma migrate resolve --rolled-back <name_from_above> --schema prisma/schema.prisma
> node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
> ```

**4) Regenerate the client (server-native engine), then force a clean restart:**

```bash
node_modules/.bin/prisma generate --schema prisma/schema.prisma
~/apps/pcnexamdistro/stop                    # kill the process that predates the regen
sleep 2
~/apps/pcnexamdistro/start                   # expect: "Started pcnexamdistro."
```

> ⚠️ **Opalstack keepalive cron:** a cron re-runs `start` every few minutes, so the app may auto-resurrect while it's stopped (a bare `start` then prints *"already running"*). A process that started *before* `prisma generate` holds the **old** client in memory and will mishandle `item_type`/Decimal even though `/health` is green — so after generating you **must** `stop` → `start`. Confirm the log shows a **fresh** `Server running on port …` timestamp *after* the regen; that's the proof the new client is loaded.

---

## Step 5 — Verify

```bash
curl -s https://distro.pcnigeria.org.ng/health; echo
psql "$DATABASE_URL" -c "SELECT item_type, count(*) FROM \"Product\" GROUP BY item_type;"
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM \"Product\") AS products, (SELECT count(*) FROM \"Transaction\") AS transactions, (SELECT count(*) FROM \"TransactionItem\") AS tx_items, (SELECT count(*) FROM \"Inventory\") AS inventory;"
```

**Pass criteria:** `/health` → `{"status":"ok"}` · every product `item_type = PRODUCT` · **row counts identical** to Step 4.
Then, in the app: products load, low-stock works, and a test sale completes.

Confirm the app booted cleanly (no Prisma client / DB errors in the log):

```bash
tail -n 40 ~/logs/apps/pcnexamdistro/logfile.log
```

Optional — confirm a column was widened (should read `numeric(15,4)`):

```bash
psql "$DATABASE_URL" -c "\d \"Inventory\""
```

---

## Step 5b — Retire the stale root schema (after verification passes)

Recommended so a future *bare* `prisma generate` / `migrate` can't read the outdated root schema. Nothing at runtime uses this file (`start` runs `node dist/index.js`), so renaming it is safe — keep the `.legacy_*` copy, don't delete it.

```bash
mv schema.prisma schema.prisma.legacy_$(date +%F)
node_modules/.bin/prisma migrate status --schema prisma/schema.prisma   # sanity: 0 pending, no errors
```

After this, `prisma/schema.prisma` is the only schema so bare commands resolve to it too. **Do this only once Step 5 has fully passed** — while rollback (Step 6) is still on the table, leave the root schema in place.

---

## Step 6 — Rollback (only if a check fails)

```bash
~/apps/pcnexamdistro/stop
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/pos_backup_YYYYMMDD_HHMMSS.dump   # the file from Step 4
rm -rf dist && cp -r dist_backup_2026-08-21_1431 dist                                             # the code backup from Step 2
node_modules/.bin/prisma generate --schema schema.prisma                                          # OLD root schema — matches restored DB + old dist
~/apps/pcnexamdistro/start
```

Rollback regenerates from the **root** `schema.prisma` (the pre-change schema, no `item_type`/Decimal) so the client matches the restored database and the old `dist`. Returns database **and** code to the exact pre-deploy state.

---

## Step 7 — Ship the updated app (APK)

The backend deploy above is backward-compatible, so the **old** installed app keeps working. The new
All / Products / Services filters and full service handling appear only after clients install the new APK.

1. **Build points at production** — `mobile/eas.json` sets `EXPO_PUBLIC_API_URL=https://distro.pcnigeria.org.ng/v1`
   for both profiles, so a release APK already targets the live server. (Do **not** ship an APK built with
   `mobile/.env`'s local LAN IP — that only works on your test network.)
2. **Distribute** the `.apk` to clients (email/download link/MDM). They install it over the existing app.
3. **Data is preserved on update** as long as the APK is signed with the **same key** as the installed app
   (same Android package + signature → in-app cache/login survive the update).
   - If the signing key differs, Android blocks the in-place update; the client must uninstall first, which
     clears only the **local cache/login** — all real data lives on the server and is unaffected. They just
     log in again after installing.
4. After updating, have one client confirm: New Sale shows the `All / Products / Services` filter row with
   live counts, and services no longer show "0 units" or appear under Low Stock.

> Tip: bump the app's `version` / `versionCode` in `mobile/app.json` for each new APK so you and clients can
> tell builds apart.

---

## Quick reference — order of operations

1. PC: `npm run build` (done) → have `dist/` + `prisma/` ready
2. PuTTY: set `DATABASE_URL`, back up code, **run diagnosis** → pick Path A/B
3. FileZilla: upload `dist/` + `prisma/`
4. PuTTY window: `stop` → `pg_dump` + counts → `migrate deploy` (A or B) → `prisma generate` → `start`
5. Verify health + counts + app
6. Rollback only if needed
7. Distribute new APK to clients
