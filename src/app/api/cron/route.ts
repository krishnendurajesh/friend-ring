import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase-server';

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  try {
    // 1. Authenticate the Cron request
    const authHeader = request.headers.get('authorization');
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    const isAuthorized =
      (authHeader && authHeader === `Bearer ${expectedSecret}`) ||
      (querySecret && querySecret === expectedSecret);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const reports: string[] = [];

    // ==========================================
    // TASK A: Expire Carts (5-Hour Payment Window)
    // ==========================================
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

    // Query pending_payment carts started more than 5 hours ago
    const { data: expiredCarts, error: cartsError } = await supabase
      .from('carts')
      .select('id, ring_id, name:ring_id(name)')
      .eq('status', 'pending_payment')
      .lt('payment_window_started_at', fiveHoursAgo);

    if (cartsError) throw cartsError;

    if (expiredCarts && expiredCarts.length > 0) {
      for (const cart of expiredCarts) {
        // 1. Revert cart status
        const { error: updateError } = await supabase
          .from('carts')
          .update({
            status: 'editing',
            payment_window_started_at: null,
          })
          .eq('id', cart.id);

        if (updateError) {
          console.error(`Failed to revert cart ${cart.id}:`, updateError);
          continue;
        }

        // 2. Reset approvals to false
        await supabase
          .from('cart_approvals')
          .update({ approved: false })
          .eq('cart_id', cart.id);

        // 3. Reset contributions to 0
        await supabase
          .from('cart_contributions')
          .update({
            amount_pledged: 0.00,
            amount_paid: 0.00,
            paid_at: null,
          })
          .eq('cart_id', cart.id);

        // 4. Notify all accepted ring members
        const { data: members } = await supabase
          .from('ring_members')
          .select('user_id')
          .eq('ring_id', cart.ring_id)
          .eq('status', 'accepted');

        if (members && members.length > 0) {
          const notificationsToInsert = members.map((m) => ({
            user_id: m.user_id,
            type: 'cart_reverted',
            payload: {
              message: `The payment window for the group cart in "${(cart as any).name?.name || 'your Ring'}" has expired. The cart has reverted to editing state.`,
              ring_id: cart.ring_id,
            },
          }));

          await supabase.from('notifications').insert(notificationsToInsert);
        }

        reports.push(`Cart ${cart.id} reverted to editing.`);
      }
    } else {
      reports.push('No expired pending carts found.');
    }

    // ==========================================
    // TASK D: Hourly Payment Reminder Engine
    // ==========================================
    // Query active pending_payment carts that are less than 5 hours old
    const { data: activePendingCarts, error: activeCartsError } = await supabase
      .from('carts')
      .select('id, ring_id, payment_window_started_at, name:ring_id(name)')
      .eq('status', 'pending_payment')
      .gte('payment_window_started_at', fiveHoursAgo);

    if (!activeCartsError && activePendingCarts) {
      for (const cart of activePendingCarts) {
        if (!cart.payment_window_started_at) continue;
        const elapsedMs = Date.now() - new Date(cart.payment_window_started_at).getTime();
        const elapsedHours = Math.floor(elapsedMs / (60 * 60 * 1000));

        if (elapsedHours >= 1 && elapsedHours < 5) {
          // Find all users in cart_contributions for this cart where amount_paid < amount_pledged
          const { data: unpaidContributions } = await supabase
            .from('cart_contributions')
            .select('user_id, amount_pledged, amount_paid')
            .eq('cart_id', cart.id);

          if (unpaidContributions) {
            for (const contrib of unpaidContributions) {
              if (contrib.amount_paid < contrib.amount_pledged) {
                // Check if we already sent a payment reminder for this specific hour
                const { data: existingReminders } = await supabase
                  .from('notifications')
                  .select('payload')
                  .eq('user_id', contrib.user_id)
                  .eq('type', 'payment_reminder');

                const alreadySent = existingReminders?.some((n: any) => 
                  n.payload?.cart_id === cart.id && String(n.payload?.hour) === String(elapsedHours)
                );

                if (!alreadySent) {
                  await supabase.from('notifications').insert({
                    user_id: contrib.user_id,
                    type: 'payment_reminder',
                    payload: {
                      message: `⚠️ Reminder: You have an unpaid contribution in "${(cart as any).name?.name || 'your Ring'}" group cart. The payment window expires in ${5 - elapsedHours} hours!`,
                      cart_id: cart.id,
                      ring_id: cart.ring_id,
                      hour: String(elapsedHours)
                    }
                  });
                  reports.push(`Sent payment reminder to user ${contrib.user_id} for hour ${elapsedHours} of cart ${cart.id}.`);
                }
              }
            }
          }
        }
      }
    }

    // ==========================================
    // TASK E: Cart Approval Reminder (30-Minute Window)
    // ==========================================
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Query editing carts older than 30 minutes
    const { data: editingCarts, error: editingCartsError } = await supabase
      .from('carts')
      .select('id, ring_id, receiver_user_id, name:ring_id(name)')
      .eq('status', 'editing')
      .lt('created_at', thirtyMinutesAgo);

    if (!editingCartsError && editingCarts) {
      for (const cart of editingCarts) {
        // Fetch all accepted members of this Ring
        const { data: members } = await supabase
          .from('ring_members')
          .select('user_id')
          .eq('ring_id', cart.ring_id)
          .eq('status', 'accepted');

        if (members) {
          const eligibleMembers = members.filter(m => m.user_id !== cart.receiver_user_id);

          for (const member of eligibleMembers) {
            // Check if this member has already approved the cart
            const { data: approval } = await supabase
              .from('cart_approvals')
              .select('approved')
              .eq('cart_id', cart.id)
              .eq('user_id', member.user_id)
              .maybeSingle();

            // If not approved (either record doesn't exist, or approved is false)
            if (!approval || !approval.approved) {
              // Check if we already sent an approval reminder for this cart to this user
              const { data: existingReminders } = await supabase
                .from('notifications')
                .select('payload')
                .eq('user_id', member.user_id)
                .eq('type', 'cart_approval_reminder');

              const alreadySent = existingReminders?.some((n: any) => 
                n.payload?.cart_id === cart.id
              );

              if (!alreadySent) {
                await supabase.from('notifications').insert({
                  user_id: member.user_id,
                  type: 'cart_approval_reminder',
                  payload: {
                    message: `⏳ The group cart in "${(cart as any).name?.name || 'your Ring'}" is waiting for your approval! Please review and approve it.`,
                    cart_id: cart.id,
                    ring_id: cart.ring_id
                  }
                });
                reports.push(`Sent cart approval reminder to user ${member.user_id} for cart ${cart.id}.`);
              }
            }
          }
        }
      }
    }

    // ==========================================
    // TASK B: Birthday Reminder Engine (7, 3, 1 days prior, and on the day)
    // ==========================================
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, name, birthday')
      .not('birthday', 'is', null);

    if (pError) throw pError;

    if (profiles && profiles.length > 0) {
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      for (const profile of profiles) {
        const birthDate = new Date(profile.birthday);
        
        // Calculate difference in days (ignoring year, handling year wrap-around cleanly)
        const bdayThisYear = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        let diffTime = bdayThisYear.getTime() - todayMidnight.getTime();
        let diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        // If birthday already occurred this year, check the next year's birthday
        if (diffDays < 0) {
          const bdayNextYear = new Date(today.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate());
          diffTime = bdayNextYear.getTime() - todayMidnight.getTime();
          diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        }

        const triggerDays = [7, 3, 1, 0];
        if (triggerDays.includes(diffDays)) {
          // Fetch all Rings this user is an accepted member of
          const { data: memberships } = await supabase
            .from('ring_members')
            .select('ring_id, rings(name)')
            .eq('user_id', profile.id)
            .eq('status', 'accepted');

          if (memberships && memberships.length > 0) {
            for (const membership of memberships) {
              const ringId = membership.ring_id;
              const ringName = (membership as any).rings?.name || 'your Ring';

              // Get all other members of this Ring
              const { data: otherMembers } = await supabase
                .from('ring_members')
                .select('user_id')
                .eq('ring_id', ringId)
                .eq('status', 'accepted')
                .neq('user_id', profile.id);

              if (otherMembers && otherMembers.length > 0) {
                let message = '';
                if (diffDays === 0) {
                  message = `🎁 Today is ${profile.name}'s birthday! Start a group surprise cart in "${ringName}" to prepare a gift!`;
                } else if (diffDays === 1) {
                  message = `🎁 ${profile.name}'s birthday is tomorrow! Start a group surprise cart in "${ringName}" to prepare a gift!`;
                } else {
                  message = `🎁 ${profile.name}'s birthday is in exactly ${diffDays} days! Start a group surprise cart in "${ringName}" to prepare a gift!`;
                }

                const bdayReminders = otherMembers.map((member) => ({
                  user_id: member.user_id,
                  type: 'birthday_reminder',
                  payload: {
                    message,
                    ring_id: ringId,
                    birthday_user_id: profile.id,
                  },
                }));

                await supabase.from('notifications').insert(bdayReminders);
                reports.push(`Created birthday notifications for user ${profile.name} inside ring ${ringName}.`);
              }
            }
          }
        }
      }
    }

    // ==========================================
    // TASK C: Custom Ring Events Reminder Engine (7, 3, 1 days prior, and on the day)
    // ==========================================
    const { data: events, error: eError } = await supabase
      .from('ring_events')
      .select('id, ring_id, name, event_date, rings(name)');

    if (eError) {
      console.error('Error fetching ring events:', eError);
    } else if (events && events.length > 0) {
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      for (const event of events) {
        const eventDate = new Date(event.event_date);

        // Calculate difference in days (ignoring year, handling year wrap-around cleanly)
        const eventThisYear = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        let diffTime = eventThisYear.getTime() - todayMidnight.getTime();
        let diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const eventNextYear = new Date(today.getFullYear() + 1, eventDate.getMonth(), eventDate.getDate());
          diffTime = eventNextYear.getTime() - todayMidnight.getTime();
          diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        }

        const triggerDays = [7, 3, 1, 0];
        if (triggerDays.includes(diffDays)) {
          const ringName = (event as any).rings?.name || 'your Ring';

          // Get all accepted members of this Ring
          const { data: members } = await supabase
            .from('ring_members')
            .select('user_id')
            .eq('ring_id', event.ring_id)
            .eq('status', 'accepted');

          if (members && members.length > 0) {
            let message = '';
            if (diffDays === 0) {
              message = `🎉 Today is the "${event.name}" celebration for your Ring "${ringName}"!`;
            } else if (diffDays === 1) {
              message = `🎉 The "${event.name}" celebration for your Ring "${ringName}" is tomorrow!`;
            } else {
              message = `🎉 The "${event.name}" celebration for your Ring "${ringName}" is in exactly ${diffDays} days!`;
            }

            const eventReminders = members.map((member) => ({
              user_id: member.user_id,
              type: 'event_reminder',
              payload: {
                message,
                ring_id: event.ring_id,
                event_id: event.id,
              },
            }));

            await supabase.from('notifications').insert(eventReminders);
            reports.push(`Created event notifications for "${event.name}" inside ring ${ringName}.`);
          }
        }
      }
    }

    return NextResponse.json({ success: true, timestamp: now, reports });
  } catch (err: any) {
    console.error('Cron job error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
