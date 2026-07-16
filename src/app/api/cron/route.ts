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
    // TASK A: Expire Carts (1-Hour Payment Window)
    // ==========================================
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Query pending_payment carts started more than 1 hour ago
    const { data: expiredCarts, error: cartsError } = await supabase
      .from('carts')
      .select('id, ring_id, name:ring_id(name)')
      .eq('status', 'pending_payment')
      .lt('payment_window_started_at', oneHourAgo);

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

    return NextResponse.json({ success: true, timestamp: now, reports });
  } catch (err: any) {
    console.error('Cron job error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
