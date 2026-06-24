# Hamsun Supply

Inventory & supply-chain portal for a boutique hotel group (branches **FSL, EXT,
CLF, DHA**). The warehouse keeper sees current stock, recent usage, low/out
flags, reorder suggestions and expiry warnings — all **derived** from an
immutable log of physical stock movements.

## Architecture & golden rules

The whole system is built on four non-negotiable rules:

1. **Stock is never stored.** There is no `quantity_on_hand` column. Every
   physical movement writes one immutable row in `invtt.stock_movements`, and
   current stock is always computed on the fly (see `v_item_stock`).
2. **The browser only reads.** Row-Level Security exposes `SELECT` to the
   `anon`/`authenticated` roles and grants no writes. All inserts happen inside
   **Supabase Edge Functions** running with the service role.
3. **History is append-only.** A wrong count is fixed with a new `adjustment`
   movement; existing rows are never updated or deleted. This is the audit trail.
4. **Supabase is the single source of truth** for all stock data.

## Tech stack

- **Frontend:** Next.js (React) + Tailwind CSS + lucide-react, deployed on Vercel.
- **Backend:** Supabase Postgres (schema `invtt`) + Supabase Edge Functions (Deno).
- **Auth:** Supabase Auth (email). *Disabled for the MVP* — see below.

## Repository layout

```
app/                         Next.js frontend (reads v_item_stock, writes via functions)
lib/supabase/                Supabase clients (browser anon / server service-role)
supabase/
  config.toml                project + edge-function config (exposed schemas, verify_jwt)
  migrations/
    0001_init_invtt_schema.sql   (welcome-page phase; superseded)
    0002_supply_chain.sql        tables, RLS, grants, v_item_stock view
  seed.sql                   demo data: 4 branches, 18 items, movements, requests
  functions/
    _shared/utils.ts         CORS + service-role admin client + helpers
    receive-stock/           insert an 'in' movement
    issue-stock/             insert an 'out' movement (rejects over-issue)
    adjust-stock/            insert a signed 'adjustment' movement
    create-request/          insert a pending department request (Slack calls this)
    fulfil-request/          issue stock for a request, mark done (idempotent)
```

## Data model (schema `invtt`)

| Table | Purpose |
|-------|---------|
| `properties` | the four branches (`code`, `name`) |
| `suppliers` | vendors (`name`, `contact`, `lead_time_days`) |
| `items` | master list (`property_id`, `supplier_id`, `name`, `unit`, `type` fresh\|store, `par_level`, `reorder_point`) |
| `stock_movements` | the diary — `type` in\|out\|adjustment, `quantity`, `reason`, `expiry_date` (fresh `in` only), `staff_id` |
| `requests` | department requests — `quantity`, `department`, `status`, `source` slack\|portal, `fulfilled_movement_id` |
| `profiles` | staff, linked to `auth.users` (present for when auth is enabled) |

### `v_item_stock` — the one view the item list reads from

For every item it returns: `current_stock` (Σ in − Σ out ± Σ adjustment),
`status` (`out` ≤ 0, `low` ≤ reorder_point, else `ok`), `used_7d`,
`buy_qty` (`max(par − stock, 0)`), and `nearest_expiry` (earliest incoming
batch use-by, fresh items only).

## Setup

### 1. Database

Run the migration and seed against your Supabase project. Either paste them into
the **SQL Editor** (Dashboard → SQL Editor → New query) in this order:

1. `supabase/migrations/0002_supply_chain.sql`
2. `supabase/migrations/0003_hub_products_transfers.sql` *(hub-and-spoke, product catalog, transfers, supplier routing — additive, safe on live data)*
3. `supabase/seed.sql`  *(optional demo data; safe to re-run — run it **after** 0003)*

…or use the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                 # applies migrations/
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 2. Expose the `invtt` schema

Dashboard → **Settings → API → Exposed schemas** → add **`invtt`** → Save.
(Already done for this project; required for the REST API to serve the schema.)

### 3. Deploy the Edge Functions

Each function in `supabase/functions/<name>/index.ts` is **self-contained**
(no shared imports), so you can deploy two ways:

**A. Browser — no install (recommended).** Supabase Dashboard → **Edge
Functions** → **Deploy a new function** → **Via Editor**. Name it exactly
(`receive-stock`, `issue-stock`, `adjust-stock`, `create-request`,
`fulfil-request`, `transfer-stock`, `update-item`, `upsert-supplier`,
`delete-supplier`), paste the matching `index.ts`, click **Deploy**. Repeat for
all nine.

**B. CLI.** From a terminal in the project folder:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy receive-stock issue-stock adjust-stock create-request fulfil-request transfer-stock update-item upsert-supplier delete-supplier
```

Either way, functions automatically receive `SUPABASE_URL`, `SUPABASE_ANON_KEY`
and `SUPABASE_SERVICE_ROLE_KEY` from the platform — no manual secrets needed.

### 4. Frontend env vars

Create `.env.local` (and add the same in Vercel → Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# server-only; never exposed to the browser:
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Then:

```bash
npm install
npm run dev          # http://localhost:3000
```

## Edge Functions (the only writers)

All are `POST`, JSON body, and return `{ ok, item }` with the affected item's
refreshed `v_item_stock` row.

| Function | Body | Effect |
|----------|------|--------|
| `receive-stock` | `{ item_id, quantity, reason?, expiry? }` | `in` movement (expiry kept for fresh only) |
| `issue-stock` | `{ item_id, quantity, reason?\|department? }` | `out` movement; rejects over-issue |
| `adjust-stock` | `{ item_id, quantity (signed), reason }` | `adjustment` movement |
| `create-request` | `{ property_id, item_id, quantity, department, source? }` | pending request |
| `fulfil-request` | `{ request_id }` | department request → `out`; branch request → transfer; marks done (idempotent) |
| `transfer-stock` | `{ from_item_id, to_property_id, quantity, reason? }` | hub → branch transfer (linked transfer_out + transfer_in) |
| `update-item` | `{ item_id, name?, unit?, type?, par_level?, reorder_point?, supplier_id?, delivery_override? }` | edit item settings (never stock) |
| `upsert-supplier` | `{ id?, name, contact?, email?, phone?, lead_time_days?, delivery_mode? }` | create or update a supplier |
| `delete-supplier` | `{ id }` | delete a supplier (linked items keep stock; supplier_id set null) |

Example:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/receive-stock" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"item_id":"<uuid>","quantity":10,"reason":"Green Valley delivery","expiry":"2026-07-01"}'
```

## Slack integration (MVP)

For the first version, departments only **request** items via Slack. A Slack
slash command / workflow calls **`create-request`**, which drops a pending
request into the keeper's inbox in the portal. All approving/issuing happens in
the portal. `create-request` is intentionally minimal so a richer Slack flow
(signature verification, interactive approvals) can be added later without
touching the core.

To wire a Slack slash command, point it at the `create-request` function URL and
map the command fields to the JSON body. (Add Slack request-signature
verification before exposing it publicly.)

## Auth (currently off)

The MVP runs without login: `verify_jwt = false` on the functions, RLS allows
`anon` reads, and `staff_id` is left null. To enable auth later:

1. Create users in Supabase Auth and a matching row in `invtt.profiles`.
2. Flip `verify_jwt = true` in `supabase/config.toml` and redeploy functions.
3. The functions already stamp `staff_id` from the caller's JWT when a profile
   exists — no code changes required.
