-- Drop existing authenticated-only products policy
drop policy if exists "Products are viewable by authenticated users" on public.products;
drop policy if exists "Products are viewable by everyone" on public.products;

-- Create new public products policy
create policy "Products are viewable by everyone"
  on public.products for select
  using (true);
