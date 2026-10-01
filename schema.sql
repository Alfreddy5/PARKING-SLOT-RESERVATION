-- ParkEasy — Supabase schema
-- Run this in your Supabase project's SQL Editor.

create table if not exists parking_slots (
  id serial primary key,
  section text not null,        -- e.g. "A", "B", "VIP" — admin-defined
  slot_number text not null,     -- e.g. "1", "5", "Visitor" — admin-defined, not just a plain integer
  status text not null default 'Available' check (status in ('Available', 'Reserved', 'Occupied')),
  reserved_by text,
  unique (section, slot_number)
);

create table if not exists waiting_list (
  id serial primary key,
  user_name text not null,
  joined_at timestamptz not null default now()
);

-- Seed two starter sections of five slots each: A1–A5 and B1–B5.
-- The admin can rename, delete, or add more (including non-numeric
-- names like "VIP1" or "Visitor") straight from the Admin tab.
insert into parking_slots (section, slot_number, status)
values
  ('A', '1', 'Available'), ('A', '2', 'Available'), ('A', '3', 'Available'),
  ('A', '4', 'Available'), ('A', '5', 'Available'),
  ('B', '1', 'Available'), ('B', '2', 'Available'), ('B', '3', 'Available'),
  ('B', '4', 'Available'), ('B', '5', 'Available')
on conflict (section, slot_number) do nothing;

-- Row Level Security: open read/write so the anon key can be used
-- directly from the browser, matching "visible to anyone" for a
-- classroom/demo project. Lock this down before real deployment.
alter table parking_slots enable row level security;
alter table waiting_list enable row level security;

create policy "public read parking_slots" on parking_slots for select using (true);
create policy "public write parking_slots" on parking_slots for insert with check (true);
create policy "public update parking_slots" on parking_slots for update using (true);
create policy "public delete parking_slots" on parking_slots for delete using (true);

create policy "public read waiting_list" on waiting_list for select using (true);
create policy "public write waiting_list" on waiting_list for insert with check (true);
create policy "public delete waiting_list" on waiting_list for delete using (true);
