create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin', 'customer')) default 'customer',
  created_at timestamptz default now()
);
