create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price numeric not null,
  stock integer default 0,
  created_at timestamptz default now()
);
