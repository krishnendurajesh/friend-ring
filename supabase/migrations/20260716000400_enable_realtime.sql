-- Enable realtime replication for collaborative tables in an idempotent way
do $$
declare
  t_name text;
  tables_to_add text[] := array['notifications', 'carts', 'cart_items', 'cart_approvals', 'cart_contributions', 'ring_members', 'ring_events', 'messages'];
begin
  -- Ensure publication exists
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t_name in array tables_to_add loop
    if not exists (
      select 1 
      from pg_publication_rel pr
      join pg_class c on pr.prrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and c.relname = t_name
        and n.nspname = 'public'
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t_name);
    end if;
  end loop;
end $$;
