-- Create ring_events table
create table public.ring_events (
  id uuid default gen_random_uuid() primary key,
  ring_id uuid references public.rings(id) on delete cascade not null,
  name text not null,
  event_date date not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.ring_events enable row level security;

-- Policies
create policy "Users can view events for their rings"
  on public.ring_events for select
  to authenticated
  using (
    public.is_ring_member_accepted(ring_id, auth.uid()) 
    or public.is_ring_creator(ring_id, auth.uid())
  );

create policy "Users can modify events for their rings"
  on public.ring_events for all
  to authenticated
  using (
    public.is_ring_member_accepted(ring_id, auth.uid()) 
    or public.is_ring_creator(ring_id, auth.uid())
  )
  with check (
    public.is_ring_member_accepted(ring_id, auth.uid()) 
    or public.is_ring_creator(ring_id, auth.uid())
  );
