-- YBAC Funds Portal: importing payments and cashbook entries from Excel, and undoing an import.
-- Run in Supabase → SQL Editor after 004_app_functions.sql.
-- Each import is all-or-nothing: if any row fails, nothing from that file is saved.
-- Every row carries the import's batch number, so the admin can undo a whole import in one step.

begin;

alter table public.cash_entries add column if not exists import_batch uuid;
alter table public.member_tx    add column if not exists import_batch uuid;
create index if not exists cash_entries_import_batch on public.cash_entries(import_batch) where import_batch is not null;
create index if not exists member_tx_import_batch    on public.member_tx(import_batch)    where import_batch is not null;

create table if not exists public.import_batches (
  id          uuid primary key,
  kind        text not null check (kind in ('payments','cash')),
  file_name   text,
  rows        int not null,
  total       numeric(14,2) not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  undone_at   timestamptz,
  undone_by   uuid
);
alter table public.import_batches enable row level security;
drop policy if exists ib_read on public.import_batches;
create policy ib_read on public.import_batches for select to authenticated using (is_staff());
revoke delete on public.import_batches from anon, authenticated;

-- Payments: rows = [{"member_id","type","amount","date","account","method","reference","note"}, ...]
create or replace function public.import_payments(p_batch uuid, p_file text, p_rows jsonb)
returns table(row_no int, receipt_no text)
language plpgsql security definer set search_path = public as
$$
declare r jsonb; i int := 0; v_rcpt text; v_total numeric := 0;
begin
  if not is_staff() then raise exception 'Only the admin or assistant can import payments.'; end if;
  if exists (select 1 from import_batches where id = p_batch) then raise exception 'This file has already been imported.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_rcpt := record_member_payment(r->>'member_id', r->>'type', (r->>'amount')::numeric, (r->>'date')::date,
                  coalesce(nullif(r->>'account',''), 'bank'), nullif(r->>'method',''), nullif(r->>'reference',''), nullif(r->>'note',''));
    exception when others then
      raise exception 'Row %: %', i, sqlerrm;
    end;
    update member_tx set import_batch = p_batch where member_tx.receipt_no = v_rcpt;
    update cash_entries set import_batch = p_batch where id = (select cash_entry_id from member_tx t where t.receipt_no = v_rcpt);
    v_total := v_total + (r->>'amount')::numeric;
    row_no := i; receipt_no := v_rcpt; return next;
  end loop;
  insert into import_batches(id, kind, file_name, rows, total) values (p_batch, 'payments', p_file, i, v_total);
end $$;

-- Cashbook: rows = [{"date","account","direction","amount","charged_to","venture_id","venture_side","category","description","reference"}, ...]
-- Member payments must use import_payments, so only association, suspense and venture entries are accepted here.
create or replace function public.import_cash(p_batch uuid, p_file text, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as
$$
declare r jsonb; i int := 0; v_total numeric := 0; v_ch text; v_side text;
begin
  if not is_staff() then raise exception 'Only the admin or assistant can import cashbook entries.'; end if;
  if exists (select 1 from import_batches where id = p_batch) then raise exception 'This file has already been imported.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_ch := r->>'charged_to'; v_side := nullif(r->>'venture_side','');
    if v_ch not in ('association','suspense','venture') then
      raise exception 'Row %: "charged to" must be association, suspense or venture (record member payments with the payments import).', i;
    end if;
    begin
      insert into cash_entries(entry_date, account, direction, amount, charged_to, venture_id, venture_side, category, description, reference, import_batch)
      values ((r->>'date')::date, coalesce(nullif(r->>'account',''),'bank'),
              case when v_ch = 'venture' then case when v_side = 'back' then 'in' else 'out' end else r->>'direction' end,
              (r->>'amount')::numeric, v_ch,
              case when v_ch = 'venture' then nullif(r->>'venture_id','') end,
              case when v_ch = 'venture' then coalesce(v_side,'in') end,
              nullif(r->>'category',''), r->>'description', nullif(r->>'reference',''), p_batch);
    exception when others then
      raise exception 'Row %: %', i, sqlerrm;
    end;
    v_total := v_total + (r->>'amount')::numeric;
  end loop;
  insert into import_batches(id, kind, file_name, rows, total) values (p_batch, 'cash', p_file, i, v_total);
  return i;
end $$;

-- Undo a whole import (admin only). Rows are voided, not deleted, so the audit trail stays complete.
create or replace function public.undo_import(p_batch uuid, p_reason text)
returns int
language plpgsql security definer set search_path = public as
$$
declare n int;
begin
  if not is_admin() then raise exception 'Only the admin can undo an import.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason.'; end if;
  update import_batches set undone_at = now(), undone_by = auth.uid() where id = p_batch and undone_at is null;
  if not found then raise exception 'That import does not exist or was already undone.'; end if;
  update member_tx set voided = true, void_reason = 'Import undone: ' || p_reason where import_batch = p_batch and not voided;
  update cash_entries set voided = true, void_reason = 'Import undone: ' || p_reason where import_batch = p_batch and not voided;
  get diagnostics n = row_count;
  return n;
end $$;

grant select on public.import_batches to authenticated;
grant execute on function public.import_payments(uuid,text,jsonb), public.import_cash(uuid,text,jsonb), public.undo_import(uuid,text) to authenticated;

commit;
