'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Users, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewRingPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
      } else {
        setUser(user);
      }
    };
    checkUser();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase
        .from('rings')
        .insert({
          name: name.trim(),
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        // Automatically redirected to the newly created ring
        router.push(`/ring/${data.id}`);
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 24px', maxWidth: '600px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      <div className="card card-glow" style={{ padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--color-gold-light)', borderRadius: '50%', color: 'var(--color-gold)', marginBottom: '16px' }}>
            <Users size={28} />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', background: 'linear-gradient(135deg, var(--color-gold) 0%, #fff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
            Create a Ring
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            A Ring is a group of friends, family, or coworkers who contribute to shared carts and split payments.
          </p>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--color-rose-light)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: 'var(--color-rose)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '24px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-label" htmlFor="ringName">
              Ring Name
            </label>
            <input
              id="ringName"
              type="text"
              required
              placeholder="e.g. Sarah’s Birthday Surprise, Roommates Gift Circle"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              disabled={loading}
              maxLength={50}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px' }}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating Ring...' : 'Create Ring'} <Sparkles size={16} style={{ marginLeft: '4px' }} />
          </button>
        </form>
      </div>
    </div>
  );
}
