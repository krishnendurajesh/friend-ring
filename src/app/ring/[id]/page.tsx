'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { ArrowLeft, Users, UserPlus, Gift, MessageSquare, Search, Trash2, Mail, Calendar, Sparkles } from 'lucide-react';

export default function RingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ringId } = use(params);
  const [user, setUser] = useState<any>(null);
  const [ring, setRing] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Custom Celebrations State
  const [events, setEvents] = useState<any[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLoading, setEventLoading] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const initPage = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);

      // Fetch current user profile name for invitation notifications
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();
      setCurrentUserProfile(profile);

      await fetchRingDetails();
      await fetchMembers();
      await fetchEvents();
    };

    initPage();

    // Subscribe to changes in ring members & events to keep lists in sync
    const channel = supabase
      .channel(`ring_detail_${ringId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ring_members', filter: `ring_id=eq.${ringId}` },
        () => {
          fetchMembers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ring_events', filter: `ring_id=eq.${ringId}` },
        () => {
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ringId, router]);

  const fetchRingDetails = async () => {
    const { data, error } = await supabase
      .from('rings')
      .select('*')
      .eq('id', ringId)
      .single();

    if (error) {
      console.error('Error fetching ring:', error);
      setErrorMessage('Could not load Ring details. You might not be a member.');
      setLoading(false);
    } else {
      setRing(data);
    }
  };

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('ring_members')
      .select(`
        status,
        user_id,
        profiles (
          id,
          name,
          email,
          preference_bio
        )
      `)
      .eq('ring_id', ringId);

    if (!error && data) {
      setMembers(data);
    }
    setLoading(false);
  };

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('ring_events')
      .select('*')
      .eq('ring_id', ringId)
      .order('event_date', { ascending: true });

    if (!error && data) {
      setEvents(data);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || !eventDate) return;
    setEventLoading(true);

    const { error } = await supabase
      .from('ring_events')
      .insert({
        ring_id: ringId,
        name: eventName,
        event_date: eventDate,
      });

    if (error) {
      alert('Error adding celebration: ' + error.message);
    } else {
      setEventName('');
      setEventDate('');
      await fetchEvents();
    }
    setEventLoading(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to remove this celebration?')) return;

    const { error } = await supabase
      .from('ring_events')
      .delete()
      .eq('id', eventId);

    if (error) {
      alert('Error deleting event: ' + error.message);
    } else {
      await fetchEvents();
    }
  };

  // Search users in database to invite
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      .limit(10);

    if (!error && data) {
      // Exclude users already in the ring
      const memberIds = members.map((m) => m.user_id);
      const filtered = data.filter((u) => u.id !== user?.id && !memberIds.includes(u.id));
      setSearchResults(filtered);
    }
  };

  const handleInvite = async (targetUser: any) => {
    if (inviteLoading) return;
    setInviteLoading(true);

    try {
      // 1. Insert into ring_members
      const { error: inviteError } = await supabase
        .from('ring_members')
        .insert({
          ring_id: ringId,
          user_id: targetUser.id,
          status: 'invited',
        });

      if (inviteError) {
        alert('Error inviting user: ' + inviteError.message);
        return;
      }

      // 2. Insert into notifications
      await supabase
        .from('notifications')
        .insert({
          user_id: targetUser.id,
          type: 'ring_invite',
          payload: {
            message: `${currentUserProfile?.name || 'Someone'} invited you to join the ring "${ring.name}".`,
            ring_id: ringId,
            ring_name: ring.name,
            sender_name: currentUserProfile?.name || 'A friend',
          },
        });

      // Clear search result
      setSearchResults((prev) => prev.filter((u) => u.id !== targetUser.id));
      setSearchQuery('');
      await fetchMembers();
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member or cancel their invitation?')) return;

    const { error } = await supabase
      .from('ring_members')
      .delete()
      .eq('ring_id', ringId)
      .eq('user_id', memberId);

    if (!error) {
      await fetchMembers();
    } else {
      alert('Failed to remove member.');
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="logo-ring" style={{ width: '40px', height: '40px', border: '4px solid var(--color-gold)', marginBottom: '16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading ring details...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '500px', margin: '0 auto', border: '1px solid rgba(244,63,94,0.2)' }}>
          <h3 style={{ color: 'var(--color-rose)', fontSize: '20px', marginBottom: '12px' }}>Access Denied</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{errorMessage}</p>
          <Link href="/dashboard" className="btn btn-primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const userStatus = members.find((m) => m.user_id === user?.id)?.status;
  const isCreator = ring.created_by === user?.id;

  return (
    <div className="container" style={{ padding: '40px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      {/* Ring Header */}
      <div className="card" style={{ padding: '32px', marginBottom: '40px', background: 'radial-gradient(circle at right, rgba(212,175,55,0.05) 0%, transparent 60%)' }}>
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <span className="badge badge-gold" style={{ marginBottom: '8px' }}>Active Ring</span>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>{ring.name}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Created on {new Date(ring.created_at).toLocaleDateString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href={`/ring/${ringId}/chat`} className="btn btn-secondary" style={{ padding: '12px 18px' }}>
              <MessageSquare size={16} /> Chat
            </Link>
            <Link href={`/ring/${ringId}/cart`} className="btn btn-primary" style={{ padding: '12px 24px' }}>
              <Gift size={16} /> Shared Cart
            </Link>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Members List Column */}
        <div className="card">
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={20} style={{ color: 'var(--color-gold)' }} /> Ring Members ({members.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {members.map((member) => {
              const profile = member.profiles;
              if (!profile) return null;
              
              const isSelf = profile.id === user.id;
              const memberIsCreator = profile.id === ring.created_by;

              return (
                <div
                  key={profile.id}
                  className="flex-between"
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flexGrow: 1, marginRight: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', color: 'white', fontSize: '14px' }}>
                        {profile.name} {isSelf && '(You)'}
                      </span>
                      {memberIsCreator && (
                        <span className="badge badge-gold" style={{ fontSize: '9px', padding: '2px 6px' }}>Creator</span>
                      )}
                    </div>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {profile.email}
                    </span>
                    {profile.preference_bio && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          background: 'rgba(212,175,55,0.04)',
                          borderLeft: '2px solid var(--color-gold)',
                          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          lineHeight: '1.4',
                          maxWidth: '400px'
                        }}
                      >
                        <strong>🎁 Gift Taste:</strong> {profile.preference_bio}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Status Badge */}
                    <span
                      className={`badge ${
                        member.status === 'accepted'
                          ? 'badge-green'
                          : member.status === 'invited'
                          ? 'badge-gold'
                          : 'badge-rose'
                      }`}
                      style={{ fontSize: '10px' }}
                    >
                      {member.status}
                    </span>

                    {/* Remove Action (only for creator, or users leaving themselves) */}
                    {(isCreator || isSelf) && !memberIsCreator && (
                      <button
                        onClick={() => handleRemoveMember(profile.id)}
                        className="btn-icon"
                        style={{ padding: '6px', color: 'var(--color-rose)' }}
                        title={isSelf ? 'Leave Ring' : 'Remove Member'}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite Column (Only if user has accepted membership) */}
        {userStatus === 'accepted' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Invite Friends Card */}
            <div className="card">
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserPlus size={20} style={{ color: 'var(--color-gold)' }} /> Invite Friends
              </h3>
              
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                Search for users by their name or email to invite them to this Ring.
              </p>

              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                <div style={{ position: 'relative', flexGrow: 1 }}>
                  <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '48px' }}
                  />
                </div>
                <button type="submit" className="btn btn-secondary">Search</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {searchResults.length > 0 &&
                  searchResults.map((targetUser) => (
                    <div
                      key={targetUser.id}
                      className="flex-between"
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div>
                        <span style={{ display: 'block', fontWeight: '600', color: 'white', fontSize: '13px' }}>
                          {targetUser.name}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {targetUser.email}
                        </span>
                      </div>
                      <button
                        disabled={inviteLoading}
                        onClick={() => handleInvite(targetUser)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                      >
                        Invite
                      </button>
                    </div>
                  ))}

                {searchQuery && searchResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No matching users found or they are already members.
                  </div>
                )}
              </div>
            </div>

            {/* Custom Celebrations Card */}
            <div className="card">
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} style={{ color: 'var(--color-gold)' }} /> Custom Celebrations
              </h3>
              
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                Add anniversaries, milestones, or recurring events. Everyone in the Ring will get reminders!
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {events.length > 0 ? (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className="flex-between"
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div>
                        <span style={{ display: 'block', fontWeight: '600', color: 'white', fontSize: '14px' }}>
                          {event.name}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <Calendar size={12} style={{ color: 'var(--color-gold)' }} />
                          {new Date(event.event_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} (Annual)
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="btn-icon"
                        style={{ padding: '6px', color: 'var(--color-rose)' }}
                        title="Remove Celebration"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No custom celebrations added yet.
                  </div>
                )}
              </div>

              <form onSubmit={handleAddEvent} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'white' }}>Add Celebration</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <input
                      type="text"
                      placeholder="e.g. Friendship Anniversary, Reunion"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="form-input"
                      required
                      style={{ flexGrow: 1 }}
                    />
                    <button
                      type="submit"
                      disabled={eventLoading}
                      className="btn btn-primary"
                      style={{ padding: '10px 16px' }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="card flex-center" style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div>
              <Mail size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Invite Access Locked</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                You must accept the invitation to this Ring before you can invite other members.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
