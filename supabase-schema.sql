-- TaskPilot schema
-- Run this in Supabase: Project -> SQL Editor -> New query -> paste -> Run

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_date date not null,
  due_time time,                       -- optional, e.g. '18:30'
  status text not null default 'pending',   -- pending | done
  priority text not null default 'normal',  -- low | normal | high
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- Reset reminder_sent automatically if a task's due_date is edited
create or replace function reset_reminder_on_date_change()
returns trigger as $$
begin
  if new.due_date is distinct from old.due_date then
    new.reminder_sent := false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reset_reminder on tasks;
create trigger trg_reset_reminder
before update on tasks
for each row execute function reset_reminder_on_date_change();

-- Row Level Security
-- This is a single-user personal tracker, so we allow the anon key full access.
-- Do NOT reuse this table/key setup for a multi-user app.
alter table tasks enable row level security;

create policy "public access for personal use"
on tasks
for all
using (true)
with check (true);
