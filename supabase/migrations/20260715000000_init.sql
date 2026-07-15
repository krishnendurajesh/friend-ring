-- ==========================================
-- 1. TABLE CREATIONS
-- ==========================================

-- Create profiles table linked to Supabase auth users
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  birthday date,
  address text,
  created_at timestamptz default now()
);

-- Create products table
create table public.products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  price numeric(10, 2) not null,
  image_url text,
  category text,
  created_at timestamptz default now()
);

-- Create wishlists table
create table public.wishlists (
  user_id uuid references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);

-- Create rings table
create table public.rings (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Create ring_members table
create table public.ring_members (
  ring_id uuid references public.rings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null check (status in ('invited', 'accepted', 'declined')),
  created_at timestamptz default now(),
  primary key (ring_id, user_id)
);

-- Create carts table
create table public.carts (
  id uuid default gen_random_uuid() primary key,
  ring_id uuid references public.rings(id) on delete cascade,
  status text not null check (status in ('editing', 'pending_payment', 'completed', 'expired_reverted')),
  receiver_user_id uuid references public.profiles(id) on delete set null,
  payment_window_started_at timestamptz,
  created_at timestamptz default now()
);

-- Create cart_items table
create table public.cart_items (
  cart_id uuid references public.carts(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  added_by_user_id uuid references public.profiles(id),
  quantity integer not null default 1,
  created_at timestamptz default now(),
  primary key (cart_id, product_id)
);

-- Create cart_approvals table
create table public.cart_approvals (
  cart_id uuid references public.carts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  approved boolean not null default false,
  updated_at timestamptz default now(),
  primary key (cart_id, user_id)
);

-- Create cart_contributions table
create table public.cart_contributions (
  cart_id uuid references public.carts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  amount_pledged numeric(10, 2) not null default 0.00,
  amount_paid numeric(10, 2) not null default 0.00,
  paid_at timestamptz,
  primary key (cart_id, user_id)
);

-- Create notifications table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- Create placeholder chat messages table for future feature
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  ring_id uuid references public.rings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- ==========================================
-- 2. ROW-LEVEL SECURITY ENABLING
-- ==========================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.wishlists enable row level security;
alter table public.rings enable row level security;
alter table public.ring_members enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.cart_approvals enable row level security;
alter table public.cart_contributions enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;

-- ==========================================
-- 3. SECURITY POLICIES DEFINITIONS
-- ==========================================

-- Helper functions to avoid infinite recursion in RLS policies
create or replace function public.is_ring_member(p_ring_id uuid, p_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.ring_members
    where ring_id = p_ring_id and user_id = p_user_id
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_ring_member_accepted(p_ring_id uuid, p_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.ring_members
    where ring_id = p_ring_id and user_id = p_user_id and status = 'accepted'
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_ring_creator(p_ring_id uuid, p_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.rings
    where id = p_ring_id and created_by = p_user_id
  );
end;
$$ language plpgsql security definer;

-- Profiles
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Products
create policy "Products are viewable by authenticated users"
  on public.products for select
  to authenticated
  using (true);

-- Wishlists
create policy "Wishlists are viewable by authenticated users"
  on public.wishlists for select
  to authenticated
  using (true);

create policy "Users can modify their own wishlist"
  on public.wishlists for all
  to authenticated
  using (auth.uid() = user_id);

-- Rings
create policy "Users can view rings they are part of"
  on public.rings for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_ring_member(id, auth.uid())
  );

create policy "Users can create rings"
  on public.rings for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Ring creators can update rings"
  on public.rings for update
  to authenticated
  using (auth.uid() = created_by);

-- Ring Members
create policy "Members can view other members of their rings"
  on public.ring_members for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_ring_member(ring_id, auth.uid())
  );

create policy "Members can invite others"
  on public.ring_members for insert
  to authenticated
  with check (
    public.is_ring_member_accepted(ring_id, auth.uid())
    or public.is_ring_creator(ring_id, auth.uid())
  );

create policy "Members can accept or decline their own membership"
  on public.ring_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members can leave or creators can delete invitations"
  on public.ring_members for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_ring_creator(ring_id, auth.uid())
  );

-- Carts (Surprise Hidden Cart Rule)
create policy "Users can view carts in their rings if they are not the receiver"
  on public.carts for select
  to authenticated
  using (
    public.is_ring_member_accepted(ring_id, auth.uid())
    and (receiver_user_id is null or receiver_user_id != auth.uid())
  );

create policy "Users can modify carts in their rings if they are not the receiver"
  on public.carts for all
  to authenticated
  using (
    public.is_ring_member_accepted(ring_id, auth.uid())
    and (receiver_user_id is null or receiver_user_id != auth.uid())
  )
  with check (
    public.is_ring_member_accepted(ring_id, auth.uid())
    and (receiver_user_id is null or receiver_user_id != auth.uid())
  );

-- Cart Items
create policy "Users can access items of accessible carts"
  on public.cart_items for all
  to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
    )
  )
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_items.cart_id
    )
  );

-- Cart Approvals
create policy "Users can access approvals of accessible carts"
  on public.cart_approvals for all
  to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_approvals.cart_id
    )
  )
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_approvals.cart_id
    )
  );

-- Cart Contributions
create policy "Users can access contributions of accessible carts"
  on public.cart_contributions for all
  to authenticated
  using (
    exists (
      select 1 from public.carts
      where carts.id = cart_contributions.cart_id
    )
  )
  with check (
    exists (
      select 1 from public.carts
      where carts.id = cart_contributions.cart_id
    )
  );

-- Notifications
create policy "Users can view and update their own notifications"
  on public.notifications for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can create notifications for others"
  on public.notifications for insert
  to authenticated
  with check (true);

-- Messages
create policy "Members can view chat messages"
  on public.messages for select
  to authenticated
  using (public.is_ring_member_accepted(ring_id, auth.uid()));

create policy "Members can send chat messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_ring_member_accepted(ring_id, auth.uid())
  );

-- ==========================================
-- 4. FUNCTIONS AND TRIGGERS
-- ==========================================

-- Trigger: Sync auth.users with public.profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger: Automatically create a cart and add creator as member when a new ring is created
create or replace function public.handle_new_ring_cart()
returns trigger as $$
begin
  insert into public.carts (ring_id, status)
  values (new.id, 'editing');

  insert into public.ring_members (ring_id, user_id, status)
  values (new.id, new.created_by, 'accepted');

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_ring_created
  after insert on public.rings
  for each row execute procedure public.handle_new_ring_cart();

-- Trigger: Reset approvals on cart items modification
create or replace function public.reset_cart_approvals_on_item_change()
returns trigger as $$
declare
  v_cart_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_cart_id := old.cart_id;
  else
    v_cart_id := new.cart_id;
  end if;

  -- Reset all approvals for this cart to false
  update public.cart_approvals
  set approved = false
  where cart_id = v_cart_id;

  -- Revert status back to editing if it is not completed
  update public.carts
  set status = 'editing'
  where id = v_cart_id and status in ('pending_payment', 'expired_reverted');

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_cart_item_change
  after insert or update or delete on public.cart_items
  for each row execute procedure public.reset_cart_approvals_on_item_change();

-- Trigger: Reset approvals when cart receiver changes
create or replace function public.reset_cart_approvals_on_cart_receiver_change()
returns trigger as $$
begin
  if (old.receiver_user_id is distinct from new.receiver_user_id) or (old.status = 'pending_payment' and new.status = 'editing') then
    -- Reset all approvals
    update public.cart_approvals
    set approved = false
    where cart_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_cart_receiver_change
  before update on public.carts
  for each row execute procedure public.reset_cart_approvals_on_cart_receiver_change();

-- Trigger: Transition cart to pending_payment when all accepted members approve
create or replace function public.check_cart_approvals_transition()
returns trigger as $$
declare
  v_ring_id uuid;
  v_receiver_user_id uuid;
  v_total_members int;
  v_approved_members int;
begin
  -- Get ring_id and receiver of the cart
  select ring_id, receiver_user_id into v_ring_id, v_receiver_user_id 
  from public.carts 
  where id = new.cart_id;

  -- Count accepted members in the ring (excluding the receiver if there is one)
  select count(*) into v_total_members
  from public.ring_members
  where ring_id = v_ring_id 
    and status = 'accepted'
    and (v_receiver_user_id is null or user_id != v_receiver_user_id);

  -- Count approved members for this cart
  select count(*) into v_approved_members
  from public.cart_approvals
  where cart_id = new.cart_id and approved = true;

  -- If all accepted members approved, transition cart to pending_payment
  if v_total_members > 0 and v_total_members = v_approved_members then
    update public.carts
    set status = 'pending_payment',
        payment_window_started_at = now()
    where id = new.cart_id and status = 'editing';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_cart_approval_update
  after insert or update on public.cart_approvals
  for each row execute procedure public.check_cart_approvals_transition();
