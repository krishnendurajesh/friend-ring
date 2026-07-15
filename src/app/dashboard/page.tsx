'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Plus, Gift, Check, X, ShieldAlert, ArrowRight, Bell, Users } from 'lucide-react';

interface RingData {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  member_count?: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [rings, setRings] = useState<RingData[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const initDashboard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);
      await fetchData(user.id);
    };

    initDashboard();

    // Set up realtime channel to reload rings and invites if memberships change
    const channel = supabase
      .channel('dashboard_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ring_members' },
        () => {
          if (user) fetchData(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const fetchData = async (userId: string) => {
    try {
      setLoading(true);
      
      // Fetch user's rings (both accepted and invited)
      const { data: membersData, error: membersError } = await supabase
        .from('ring_members')
        .select(`
          status,
          rings (
            id,
            name,
            created_at,
            created_by
          )
        `)
        .eq('user_id', userId);

      if (membersError) throw membersError;

      const acceptedRings: RingData[] = [];
      const invitedRings: any[] = [];

      if (membersData) {
        for (const item of membersData) {
          const ring: any = item.rings;
          if (!ring) continue;

          if (item.status === 'accepted') {
            // Fetch member count for each ring
            const { count } = await supabase
              .from('ring_members')
              .select('*', { count: 'exact', head: true })
              .eq('ring_id', ring.id);
            
            acceptedRings.push({
              ...ring,
              member_count: count || 1,
            });
          } else if (item.status === 'invited') {
            // Find who invited (creator of the ring)
            const { data: creatorProfile } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', ring.created_by)
              .single();

            invitedRings.push({
              id: ring.id,
              name: ring.name,
              invited_by: creatorProfile?.name || 'Someone',
            });
          }
        }
      }

      setRings(acceptedRings);
      setInvites(invitedRings);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      console.error('Error message:', err?.message || err);
      console.error('Error details:', err?.details);
      console.error('Error hint:', err?.hint);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteResponse = async (ringId: string, accept: boolean) => {
    if (!user) return;
    try {
      if (accept) {
        // Accept: update status to accepted
        const { error } = await supabase
          .from('ring_members')
          .update({ status: 'accepted' })
          .eq('ring_id', ringId)
          .eq('user_id', user.id);

        if (error) throw error;
        
        // Add a notification for acceptance
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'system_alert',
          payload: {
            message: `You accepted the invite to join the ring.`,
          },
        });
      } else {
        // Decline: delete ring member entry
        const { error } = await supabase
          .from('ring_members')
          .delete()
          .eq('ring_id', ringId)
          .eq('user_id', user.id);

        if (error) throw error;
      }
      
      // Update local states
      await fetchData(user.id);
    } catch (err) {
      console.error('Error handling invitation response:', err);
      alert('Error updating invitation.');
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="logo-ring" style={{ width: '40px', height: '40px', border: '4px solid var(--color-gold)', marginBottom: '16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 24px' }}>
      {/* Welcome Banner */}
      <div className="flex-between" style={{ marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Your Rings
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manage your groups, invite friends, and coordinate collaborative gifts.
          </p>
        </div>
        <Link href="/ring/new" className="btn btn-primary" style={{ padding: '12px 24px' }}>
          <Plus size={18} /> Create New Ring
        </Link>
      </div>

      {/* Invitations Alert */}
      {invites.length > 0 && (
        <div
          className="pulse-gold"
          style={{
            background: 'var(--color-gold-light)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '20px 24px',
            marginBottom: '40px',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <h3 style={{ color: 'var(--color-gold)', fontSize: '18px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} /> Pending Ring Invitations ({invites.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex-between"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-sm)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <span style={{ fontWeight: '600', color: 'white' }}>{invite.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px', marginLeft: '12px' }}>
                    invited by {invite.invited_by}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleInviteResponse(invite.id, true)}
                    className="btn btn-primary"
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    onClick={() => handleInviteResponse(invite.id, false)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <X size={14} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rings Grid */}
      {rings.length === 0 ? (
        <div
          className="card flex-center"
          style={{
            padding: '80px 24px',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.01)',
            borderStyle: 'dashed',
            borderWidth: '2px',
          }}
        >
          <div style={{ maxWidth: '400px' }}>
            <Users size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No active Rings</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Create a Ring and invite your friends, family, or colleagues to coordinate group gifts and split payments!
            </p>
            <Link href="/ring/new" className="btn btn-primary">
              <Plus size={16} /> Create Your First Ring
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {rings.map((ring) => (
            <div key={ring.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
                  {ring.name}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Created {new Date(ring.created_at).toLocaleDateString()}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={16} style={{ color: 'var(--color-gold)' }} />
                  <span>{ring.member_count} members</span>
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                <Link
                  href={`/ring/${ring.id}`}
                  className="btn btn-secondary"
                  style={{ flexGrow: 1, padding: '8px 12px', fontSize: '13px' }}
                >
                  Manage Ring
                </Link>
                <Link
                  href={`/ring/${ring.id}/cart`}
                  className="btn btn-primary"
                  style={{ flexGrow: 1, padding: '8px 12px', fontSize: '13px' }}
                >
                  Go to Cart <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
