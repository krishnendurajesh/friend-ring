import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase-server';
import { decryptText } from '@/utils/crypto';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { profileId, ringId } = body;

    if (!profileId || !ringId) {
      return NextResponse.json({ error: 'Missing profileId or ringId' }, { status: 400 });
    }

    // 1. Verify that the current user is an accepted member of this ring
    const { data: member, error: memberError } = await supabase
      .from('ring_members')
      .select('status')
      .eq('ring_id', ringId)
      .eq('user_id', user.id)
      .eq('status', 'accepted')
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Access denied: You are not an accepted member of this Ring.' },
        { status: 403 }
      );
    }

    // 2. Fetch the target profile's encrypted address
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('address')
      .eq('id', profileId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    if (!targetProfile.address) {
      return NextResponse.json({ address: '' });
    }

    // 3. Decrypt the address on the server side
    const decryptedAddress = decryptText(targetProfile.address);

    return NextResponse.json({ address: decryptedAddress });
  } catch (err: any) {
    console.error('Decrypt Address API Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
