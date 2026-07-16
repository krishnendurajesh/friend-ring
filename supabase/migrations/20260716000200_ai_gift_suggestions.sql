-- Rename gift_preferences to preference_bio on profiles
alter table public.profiles rename column gift_preferences to preference_bio;

-- Add updated_at to profiles to manage suggestions cache
alter table public.profiles add column updated_at timestamptz default now();

-- Create gift_suggestions table
create table public.gift_suggestions (
  receiver_user_id uuid references public.profiles(id) on delete cascade not null,
  ring_id uuid references public.rings(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  reason text not null,
  generated_at timestamptz default now(),
  primary key (receiver_user_id, ring_id, product_id)
);

-- Enable RLS for gift_suggestions
alter table public.gift_suggestions enable row level security;

-- Policies for gift_suggestions
create policy "Users can view suggestions for their rings if they are not the receiver"
  on public.gift_suggestions for select
  to authenticated
  using (
    public.is_ring_member_accepted(ring_id, auth.uid())
    and receiver_user_id != auth.uid()
  );
