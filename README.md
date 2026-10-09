# YBAC Funds Portal

Member portal and admin backend for YELF Business Associates and Consultancy.
Specification: see the YBAC App project (`ybac_app_specification.tex`).

## Stack
Next.js (TypeScript) · Supabase (PostgreSQL, Auth, Storage) · Vercel.

## Database setup (Supabase → SQL Editor)
Run in this order, each as one query:

1. `supabase/migrations/001_schema.sql` creates tables, views, security rules and the audit log.
2. `YBAC_002_seed_data.sql` (kept outside this repository; it contains member contact details)
   loads the reconciled records from Aug 2023 to 6 Oct 2026.
3. `supabase/migrations/004_app_functions.sql` adds the sign-up gate, receipt numbers and the payment, withdrawal and bank-interest functions.
4. Sign in to the app once, then run `supabase/migrations/003_first_admin.sql` to make yourself admin.

Supabase → Authentication → URL Configuration: set the Site URL to the Vercel address and add `<site>/auth/callback` as a redirect URL.

After step 2, `select * from reconciliation;` must show `books_cash = bank_plus_petty = 204249.27`.

## Security model
- Members see only their own record, ledger, shares and withdrawal requests, plus group-wide
  ventures, declarations, resolutions and group performance totals.
- Assistants can view all records and add member payments (dues, BRA, additional investment,
  sign-on fee) and cashbook entries.
- Only the admin can edit, void, declare profit, fix venture shares, record resolutions,
  approve withdrawals or change roles.
- No row can be deleted through the API. Every insert and update is written to `audit_log`.

## Accounting rules (summary)
- Balances are computed from `member_tx`; nothing is stored as a running total.
- Venture profit = money back − money in (incl. payables once committed, non-cash settlements).
- Declared profit: levy (by resolution) to the association, the rest shared by fixed shares,
  rounded down to the pesewa; remainders to the association.
- Bank interest is shared monthly by balance and is levy-free.
