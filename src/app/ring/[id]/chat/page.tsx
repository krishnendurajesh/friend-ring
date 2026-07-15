'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Sparkles } from 'lucide-react';

export default function RingChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ringId } = use(params);

  return (
    <div className="container flex-center" style={{ minHeight: 'calc(100vh - 120px)', padding: '40px 24px' }}>
      <div className="card card-glow" style={{ maxWidth: '500px', width: '100%', padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--color-gold-light)', borderRadius: '50%', color: 'var(--color-gold)', marginBottom: '24px' }}>
          <MessageSquare size={36} />
        </div>
        
        <h1 style={{ fontSize: '28px', fontWeight: '800', background: 'linear-gradient(135deg, var(--color-gold) 0%, #fff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '12px' }}>
          Live Ring Chat
        </h1>
        
        <p style={{ color: 'var(--color-gold)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          ✨ Coming Soon in Phase 2
        </p>

        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px', lineHeight: '1.6' }}>
          We are building a real-time chat module for Ring members to share catalog items, negotiate split payments, and plot surprise gifts! The Postgres schema already contains the `messages` table, ready to back this feature without schema rewrites.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Link href={`/ring/${ringId}`} className="btn btn-primary" style={{ padding: '12px' }}>
            <ArrowLeft size={16} /> Back to Ring Details
          </Link>
        </div>
      </div>
    </div>
  );
}
