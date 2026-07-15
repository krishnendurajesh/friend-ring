import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh user session if needed
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/auth');
  const isApiRoute = path.startsWith('/api');
  const isStaticFile = path.includes('.') || path.startsWith('/_next') || path === '/favicon.ico';
  const isPublicCatalog = path === '/';

  // 1. Redirect unauthenticated users trying to access core app pages
  if (!user && !isAuthRoute && !isPublicCatalog && !isApiRoute && !isStaticFile) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // 2. If logged in, protect core pages by forcing onboarding (birthday + shipping address)
  if (user) {
    const isCoreAppRoute = path.startsWith('/dashboard') || path.startsWith('/ring') || path.startsWith('/wishlist');
    
    if (isCoreAppRoute) {
      // Query profiles to check onboarding status
      const { data: profile } = await supabase
        .from('profiles')
        .select('birthday, address')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.birthday || !profile.address) {
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }
    }

    // 3. Redirect authenticated users away from auth pages to dashboard
    if (isAuthRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - all SVG, PNG, JPG, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
