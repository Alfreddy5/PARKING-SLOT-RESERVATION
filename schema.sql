-- ParkEasy — Supabase schema
-- Run this in your Supabase project's SQL Editor.

create table if not exists parking_slots (
  id serial primary key,
  slot_number integer not null unique,
  status text not null default 'Available' check (status in ('Available', 'Reserved', 'Occupied')),
  reserved_by text
);

create table if not exists waiting_list (
  id serial primary key,
  user_name text not null,
  joined_at timestamptz not null default now()
);

-- Seed a handful of starter slots
insert into parking_slots (slot_number, status)
values (1, 'Available'), (2, 'Available'), (3, 'Available'),
       (4, 'Available'), (5, 'Available'), (6, 'Available')
on conflict (slot_number) do nothing;

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
