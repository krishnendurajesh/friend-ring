'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase';
import { Bell, Check, X, Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: {
    message: string;
    ring_id?: string;
    ring_name?: string;
    sender_name?: string;
    action_url?: string;
  };
  read: boolean;
  created_at: string;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime notification updates for this user
    const channel = supabase
      .channel(`user_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as Notification;
            setNotifications((prev) => [newNotif, ...prev]);
            setUnreadCount((c) => c + 1);
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotif = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
            );
            // Recalculate unread
            updateUnreadCount();
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
            updateUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  };

  const updateUnreadCount = () => {
    setNotifications((prev) => {
      setUnreadCount(prev.filter((n) => !n.read).length);
      return prev;
    });
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const handleAction = async (notification: Notification, accept: boolean) => {
    await markAsRead(notification.id);

    if (notification.type === 'ring_invite' && notification.payload.ring_id) {
      const ringId = notification.payload.ring_id;
      
      if (accept) {
        // Update member status to accepted
        const { error } = await supabase
          .from('ring_members')
          .update({ status: 'accepted' })
          .eq('ring_id', ringId)
          .eq('user_id', userId);

        if (!error) {
          // Send a notification to the creator or group that they joined
          await supabase.from('notifications').insert({
            user_id: userId, // User joins, notify members
            type: 'system_alert',
            payload: {
              message: `You accepted the invite to ${notification.payload.ring_name || 'the ring'}.`,
            },
          });
          
          router.push(`/ring/${ringId}`);
          router.refresh();
        } else {
          alert('Failed to accept invitation. Try again.');
        }
      } else {
        // Decline invite: delete the member row
        const { error } = await supabase
          .from('ring_members')
          .delete()
          .eq('ring_id', ringId)
          .eq('user_id', userId);

        if (!error) {
          setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
          router.refresh();
        } else {
          alert('Failed to decline invitation.');
        }
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="bell-container" ref={dropdownRef}>
      <button className="btn-icon" onClick={() => setIsOpen(!isOpen)} style={{ position: 'relative' }}>
        <Bell size={20} className={unreadCount > 0 ? 'text-gold' : ''} />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '50px',
            right: '0',
            width: '320px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-gold)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Inbox size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ fontSize: '13px' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-color)',
                    background: n.read ? 'transparent' : 'rgba(212, 175, 55, 0.03)',
                    transition: 'var(--transition-fast)',
                  }}
                >
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {n.payload.message}
                  </p>
                  
                  {n.type === 'ring_invite' && !n.read && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button
                        onClick={() => handleAction(n, true)}
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px' }}
                      >
                        <Check size={12} /> Accept
                      </button>
                      <button
                        onClick={() => handleAction(n, false)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px' }}
                      >
                        <X size={12} /> Decline
                      </button>
                    </div>
                  )}

                  {!n.read && n.type !== 'ring_invite' && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                  <span
                    style={{
                      display: 'block',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginTop: '6px',
                    }}
                  >
                    {new Date(n.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
