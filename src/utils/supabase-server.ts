import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJSClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client bound to Next.js cookies.
 * Used for fetching user data and performing DB changes within the user's session context (RLS active).
 */
export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if middleware refreshes the session.
          }
        },
      },
    }
  );
};

/**
 * Creates a Supabase client that uses the service role key.
 * Bypasses RLS to perform administrative actions (e.g. Cron background jobs).
 * NEVER call this on the client side!
 */
export const createAdminClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
  }
  return createSupabaseJSClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || ''
  );
};
