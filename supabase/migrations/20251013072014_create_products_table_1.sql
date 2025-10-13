create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  stock integer default 0,
  created_at timestamptz default now()
);
