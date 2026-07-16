import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/utils/supabase-server';

// Call Gemini API with lite-to-standard fallback
async function callGemini(apiKey: string, promptText: string) {
  const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
  let errorMsg = '';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: {
            parts: [{ text: 'You are a professional gift-recommender bot. You must respond only with a raw, valid JSON array containing exactly 5 elements matching the schema.' }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini API returned status ${response.status}: ${text}`);
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) return rawText;
    } catch (err: any) {
      console.warn(`Model ${model} failed:`, err.message);
      errorMsg = err.message;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${errorMsg}`);
}

export async function POST(request: Request) {
  try {
    const clientSupabase = await createServerSupabaseClient();
    const { data: { user } } = await clientSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { receiverUserId, ringId, refresh } = body;

    if (!receiverUserId || !ringId) {
      return NextResponse.json({ error: 'receiverUserId and ringId are required' }, { status: 400 });
    }

    // Hidden Cart Rule check: requesting user cannot get suggestions for themselves
    if (receiverUserId === user.id) {
      return NextResponse.json({ error: 'Forbidden: Cannot view suggestions for yourself' }, { status: 403 });
    }

    // Verify requesting user is a member of the ring or ring creator
    const { data: membership } = await clientSupabase
      .from('ring_members')
      .select('status')
      .eq('ring_id', ringId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.status !== 'accepted') {
      const { data: ring } = await clientSupabase
        .from('rings')
        .select('created_by')
        .eq('id', ringId)
        .single();

      if (!ring || ring.created_by !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const adminSupabase = createAdminClient();
    
    // Check if we already have valid cached suggestions
    let shouldRegenerate = !!refresh;

    if (!shouldRegenerate) {
      const { data: cachedSuggestions } = await adminSupabase
        .from('gift_suggestions')
        .select(`
          product_id,
          reason,
          generated_at,
          products (
            id,
            name,
            description,
            price,
            image_url,
            category
          )
        `)
        .eq('receiver_user_id', receiverUserId)
        .eq('ring_id', ringId);

      if (cachedSuggestions && cachedSuggestions.length > 0) {
        const generatedAt = new Date(cachedSuggestions[0].generated_at);

        // Check if profiles preference bio updated since generatedAt
        const { data: profile } = await adminSupabase
          .from('profiles')
          .select('updated_at')
          .eq('id', receiverUserId)
          .single();

        if (profile && profile.updated_at && new Date(profile.updated_at) > generatedAt) {
          shouldRegenerate = true;
        }

        // Check if any wishlist items added since generatedAt
        if (!shouldRegenerate) {
          const { data: latestWishlist } = await adminSupabase
            .from('wishlists')
            .select('created_at')
            .eq('user_id', receiverUserId)
            .order('created_at', { ascending: false })
            .limit(1);

          if (latestWishlist && latestWishlist.length > 0 && new Date(latestWishlist[0].created_at) > generatedAt) {
            shouldRegenerate = true;
          }
        }

        if (!shouldRegenerate) {
          // Cache is valid, return it
          const formatted = cachedSuggestions.map((item: any) => ({
            product: item.products,
            reason: item.reason
          }));
          return NextResponse.json({ suggestions: formatted });
        }
      } else {
        shouldRegenerate = true;
      }
    }

    // Cache is expired/missing or refresh requested. Query details for prompt
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('name, preference_bio')
      .eq('id', receiverUserId)
      .single();

    const { data: wishlist } = await adminSupabase
      .from('wishlists')
      .select(`
        products (
          id,
          name,
          description
        )
      `)
      .eq('user_id', receiverUserId);

    const { data: catalogue } = await adminSupabase
      .from('products')
      .select('id, name, description, price, category')
      .limit(50); // limit catalogue size to avoid huge tokens

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    // Build Prompt
    const wishlistText = wishlist && wishlist.length > 0
      ? wishlist.map((w: any) => `- ${w.products.name}: ${w.products.description || ''}`).join('\n')
      : 'No items in wishlist yet.';

    const bioText = profile?.preference_bio || 'No preferences specified.';

    const catalogueText = catalogue?.map((p: any) =>
      `ID: ${p.id} | Name: ${p.name} | Category: ${p.category} | Price: ₹${p.price} | Description: ${p.description || ''}`
    ).join('\n') || '';

    const prompt = `You are an expert gift recommending AI for the Friend Ring app.
We want to recommend the top 5 most appropriate gifts from our product catalogue for a user named "${profile?.name || 'the recipient'}".

Recipient's Wishlist Items:
${wishlistText}

Recipient's Preference Bio (style, colors, sizing, types):
${bioText}

Available Product Catalogue:
${catalogueText}

Select exactly 5 products from the catalog that match the recipient's style/wishlist.
Return a JSON array of objects, each containing:
- "product_id": The exact ID of the product from the catalog.
- "reason": A friendly, one-line explanation of why this product fits their tastes.

Example output:
[
  { "product_id": "uuid-1", "reason": "A minimalist gold necklace that perfectly matches her preference for simple jewelry." },
  { "product_id": "uuid-2", "reason": "Since she loves blue tones, this sapphire ring stack will match her wishlist." }
]

Respond only with valid JSON. No markdown backticks, no code fences, no markdown formatting, no preamble, and no explanation.`;

    const rawResponse = await callGemini(apiKey, prompt);
    let cleanedText = rawResponse.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '');
    }

    let parsedArray: any[] = [];
    try {
      parsedArray = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response as JSON. Cleaned response:', cleanedText);
      return NextResponse.json({ error: 'AI response was malformed. Please try again.' }, { status: 502 });
    }

    if (!Array.isArray(parsedArray)) {
      return NextResponse.json({ error: 'AI response was not an array.' }, { status: 502 });
    }

    const validSuggestions = parsedArray.filter((item: any) => {
      if (!item || typeof item !== 'object') return false;
      const exists = catalogue?.some((p: any) => p.id === item.product_id);
      return exists && typeof item.reason === 'string' && item.reason.trim().length > 0;
    });

    // Delete old cache and write new cache
    await adminSupabase
      .from('gift_suggestions')
      .delete()
      .eq('receiver_user_id', receiverUserId)
      .eq('ring_id', ringId);

    const insertData = validSuggestions.slice(0, 5).map((item: any) => ({
      receiver_user_id: receiverUserId,
      ring_id: ringId,
      product_id: item.product_id,
      reason: item.reason.trim(),
      generated_at: new Date().toISOString()
    }));

    if (insertData.length > 0) {
      const { error: insertError } = await adminSupabase
        .from('gift_suggestions')
        .insert(insertData);
      if (insertError) {
        console.error('Failed to cache suggestions in DB:', insertError);
      }
    }

    // Return recommendations with product details
    const resultSuggestions = [];
    for (const item of insertData) {
      const prodDetail = catalogue?.find((p: any) => p.id === item.product_id);
      if (prodDetail) {
        resultSuggestions.push({
          product: prodDetail,
          reason: item.reason
        });
      }
    }

    return NextResponse.json({ suggestions: resultSuggestions });

  } catch (err: any) {
    console.error('AI suggestions route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
