create table manifest_batches (
  id bigint generated always as identity primary key,
  manifest_id bigint, -- from Shiprocket
  manifest_url text,
  created_at timestamptz default now()
);

alter table orders 
add column shiprocket_manifest_generated boolean default false,
add column shiprocket_manifest_batch_id bigint references manifest_batches(id);
