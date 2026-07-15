'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { User, LogOut, Heart } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          setProfile(data);
        }
      } catch (error) {
        console.error('Error checking user:', error);
      } finally {
        setLoading(false);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(data);
      } else {
        setProfile(null);
      }
      setLoading(false);
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const isActive = (path: string) => pathname === path;

  // Don't show full navigation items on onboarding or login/signup screens if not onboarding
  const isOnboarding = pathname === '/onboarding';

  return (
    <nav className="navbar">
      <div className="container navbar-container">
        <Link href={user ? '/dashboard' : '/'} className="logo">
          <span className="logo-ring"></span>
          Friend Ring
        </Link>
        <div className="nav-links">
          {!loading && (
            <>
              {!isOnboarding && (
                <Link href="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
                  Catalog
                </Link>
              )}
              {user && !isOnboarding && (
                <>
                  <Link href="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
                    Dashboard
                  </Link>
                  <Link href="/wishlist" className={`nav-link ${isActive('/wishlist') ? 'active' : ''}`}>
                    <Heart size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} /> Wishlist
                  </Link>
                </>
              )}
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '12px' }}>
                  {!isOnboarding && <NotificationBell userId={user.id} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={18} style={{ color: 'var(--color-gold)' }} />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {profile?.name || user.email?.split('@')[0]}
                    </span>
                  </div>
                  <button onClick={handleSignOut} className="btn-icon" title="Sign Out">
                    <LogOut size={16} />
                  </button>
                </div>
              )}
              {!user && !pathname.startsWith('/auth') && (
                <Link href="/auth/login" className="btn btn-primary">
                  Log In
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
