-- Run this in Supabase: SQL Editor > New query > Run

create table if not exists slots (
  label  text primary key,
  status text not null default 'Available',
  name   text
);

create table if not exists waiting (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz default now()
);

-- Allow the website (anon key) to read and write both tables.
-- Simple shared-passcode project: not production-level security.
alter table slots   enable row level security;
alter table waiting enable row level security;

create policy "public slots"   on slots   for all using (true) with check (true);
create policy "public waiting" on waiting for all using (true) with check (true);

-- Optional starter slots
insert into slots (label) values ('A1'),('A2'),('A3'),('A4'),('A5'),('B1'),('B2'),('B3'),('VIP1'),('VIP2')
on conflict do nothing;
