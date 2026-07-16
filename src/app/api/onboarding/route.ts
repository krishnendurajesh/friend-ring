import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase-server';
import { encryptText } from '@/utils/crypto';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { birthday, address, gift_preferences } = body;

    if (!birthday || !address) {
      return NextResponse.json(
        { error: 'Birthday and shipping address are required' },
        { status: 400 }
      );
    }

    // Encrypt address before saving it at rest
    const encryptedAddress = encryptText(address.trim());

    // Check if the user's profile row actually exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      // Profile row is missing (signup trigger was blocked by schema permissions). Insert a new row!
      const email = user.email || '';
      const name = user.user_metadata?.name || email.split('@')[0] || 'User';
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          name,
          email,
          birthday,
          address: encryptedAddress,
          gift_preferences: gift_preferences?.trim() || null,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Profile row exists, update it
      const { error } = await supabase
        .from('profiles')
        .update({
          birthday,
          address: encryptedAddress,
          gift_preferences: gift_preferences?.trim() || null,
        })
        .eq('id', user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Onboarding API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
