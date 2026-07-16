'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import {
  ArrowLeft,
  ShoppingBag,
  User,
  Plus,
  Minus,
  Trash2,
  Gift,
  CheckSquare,
  Lock,
  DollarSign,
  Heart,
  TrendingUp,
  MapPin,
  CheckCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface CartItem {
  cart_id: string;
  product_id: string;
  added_by_user_id: string;
  quantity: number;
  products: {
    id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    category: string;
  };
  profiles: {
    name: string;
  };
}

export default function SharedCartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ringId } = use(params);
  const [user, setUser] = useState<any>(null);
  const [ring, setRing] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [contributions, setContributions] = useState<any[]>([]);
  
  // Onboarding/Wishlist receiver states
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [decryptedAddress, setDecryptedAddress] = useState('');
  const [loadingAddress, setLoadingAddress] = useState(false);

  // AI Suggestions states
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Split payment forms
  const [pledgeInput, setPledgeInput] = useState('');
  const [isApprovedBySelf, setIsApprovedBySelf] = useState(false);

  const [loading, setLoading] = useState(true);
  const [surpriseGift, setSurpriseGift] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const initCart = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);

      // Verify membership
      const { data: membership, error: memError } = await supabase
        .from('ring_members')
        .select('status')
        .eq('ring_id', ringId)
        .eq('user_id', user.id)
        .single();

      if (memError || !membership || membership.status !== 'accepted') {
        router.push('/dashboard');
        return;
      }

      await loadRingData(user.id);
    };

    initCart();
  }, [ringId, router]);

  // Set up real-time subscriptions for collaborative cart experience
  useEffect(() => {
    if (!cart?.id) return;

    // 1. Subscribe to cart status/receiver updates
    const cartSub = supabase
      .channel(`cart_updates_${cart.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'carts', filter: `id=eq.${cart.id}` },
        async (payload: any) => {
          const updatedCart = payload.new;
          setCart(updatedCart);
          
          // If status transitioned, refresh contributions/approvals
          if (updatedCart.status === 'pending_payment') {
            await fetchContributions(updatedCart.id);
          } else if (updatedCart.status === 'editing') {
            await fetchApprovals(updatedCart.id);
          }
          router.refresh();
        }
      )
      .subscribe();

    // 2. Subscribe to items changes
    const itemsSub = supabase
      .channel(`cart_items_${cart.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items', filter: `cart_id=eq.${cart.id}` },
        () => {
          fetchCartItems(cart.id);
        }
      )
      .subscribe();

    // 3. Subscribe to approvals updates
    const approvalsSub = supabase
      .channel(`cart_approvals_${cart.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_approvals', filter: `cart_id=eq.${cart.id}` },
        () => {
          fetchApprovals(cart.id);
        }
      )
      .subscribe();

    // 4. Subscribe to contributions updates
    const contributionsSub = supabase
      .channel(`cart_contributions_${cart.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_contributions', filter: `cart_id=eq.${cart.id}` },
        () => {
          fetchContributions(cart.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(cartSub);
      supabase.removeChannel(itemsSub);
      supabase.removeChannel(approvalsSub);
      supabase.removeChannel(contributionsSub);
    };
  }, [cart?.id]);

  const loadRingData = async (currentUserId: string) => {
    try {
      setLoading(true);
      // Fetch Ring Details
      const { data: ringData } = await supabase.from('rings').select('*').eq('id', ringId).single();
      setRing(ringData);

      // Fetch Ring Members
      const { data: memberData } = await supabase
        .from('ring_members')
        .select(`
          status,
          user_id,
          profiles (
            id,
            name,
            email,
            birthday
          )
        `)
        .eq('ring_id', ringId)
        .eq('status', 'accepted');
      
      setMembers(memberData || []);

      // Fetch Active Cart
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select('*')
        .eq('ring_id', ringId)
        .in('status', ['editing', 'pending_payment', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1);

      // RLS Policy check:
      // If there is no cart row returned, or if we get an RLS block:
      // But we know there is a cart. That means the user is the receiver, and RLS hid it!
      if (cartError || !cartData || cartData.length === 0) {
        setSurpriseGift(true);
        setLoading(false);
        return;
      }

      const activeCart = cartData[0];
      setCart(activeCart);

      // Load items, approvals, contributions
      await fetchCartItems(activeCart.id);
      await fetchApprovals(activeCart.id);
      await fetchContributions(activeCart.id);

      // Set self approval check
      if (activeCart.status === 'editing') {
        const myApp = approvals.find((a) => a.user_id === currentUserId);
        setIsApprovedBySelf(!!myApp?.approved);
      }

      // If receiver exists, fetch receiver's wishlist items for helper panel
      if (activeCart.receiver_user_id) {
        fetchReceiverWishlist(activeCart.receiver_user_id);
        fetchAISuggestions(activeCart.receiver_user_id);
      }

      // If completed or pending, decrypt recipient address
      if (activeCart.receiver_user_id && activeCart.status !== 'editing') {
        decryptRecipientAddress(activeCart.receiver_user_id);
      }
    } catch (err) {
      console.error('Error loading cart data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCartItems = async (cartId: string) => {
    const { data } = await supabase
      .from('cart_items')
      .select(`
        cart_id,
        product_id,
        added_by_user_id,
        quantity,
        products (
          id,
          name,
          description,
          price,
          image_url,
          category
        ),
        profiles:added_by_user_id (
          name
        )
      `)
      .eq('cart_id', cartId);

    setCartItems((data as any[]) || []);
  };

  const fetchApprovals = async (cartId: string) => {
    const { data } = await supabase
      .from('cart_approvals')
      .select(`
        cart_id,
        user_id,
        approved,
        profiles (
          name
        )
      `)
      .eq('cart_id', cartId);

    setApprovals(data || []);
    if (user && data) {
      const myApp = data.find((a) => a.user_id === user.id);
      setIsApprovedBySelf(!!myApp?.approved);
    }
  };

  const fetchContributions = async (cartId: string) => {
    const { data } = await supabase
      .from('cart_contributions')
      .select(`
        cart_id,
        user_id,
        amount_pledged,
        amount_paid,
        paid_at,
        profiles (
          name
        )
      `)
      .eq('cart_id', cartId);

    setContributions(data || []);
  };

  const fetchReceiverWishlist = async (receiverId: string) => {
    // If current user is the receiver, they shouldn't see their own wishlist in the helper panel
    // (though RLS hides the cart anyway, this is a safe fallback check)
    if (user && receiverId === user.id) {
      setWishlistItems([]);
      return;
    }

    const { data } = await supabase
      .from('wishlists')
      .select(`
        product_id,
        products (
          id,
          name,
          description,
          price,
          image_url,
          category
        )
      `)
      .eq('user_id', receiverId);

    if (data) {
      setWishlistItems(data.map((w: any) => w.products));
    }
  };

  const fetchAISuggestions = async (receiverId: string, forceRefresh = false) => {
    if (user && receiverId === user.id) {
      setAiSuggestions([]);
      return;
    }

    setAiLoading(true);
    setAiError('');
    try {
      const response = await fetch('/api/ai/suggest-gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverUserId: receiverId, ringId, refresh: forceRefresh }),
      });
      const data = await response.json();
      if (response.ok) {
        setAiSuggestions(data.suggestions || []);
      } else {
        setAiError(data.error || 'AI suggestions unavailable right now');
        console.error('AI suggestion route error:', data.error);
      }
    } catch (err) {
      setAiError('AI suggestions unavailable right now');
      console.error('Failed to load AI suggestions:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const decryptRecipientAddress = async (receiverId: string) => {
    setLoadingAddress(true);
    try {
      const response = await fetch('/api/address/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: receiverId, ringId }),
      });
      const data = await response.json();
      if (response.ok) {
        setDecryptedAddress(data.address);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAddress(false);
    }
  };

  // Adjust Cart Item Quantities
  const updateQuantity = async (productId: string, delta: number, currentQty: number) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      await removeItem(productId);
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQty })
      .eq('cart_id', cart.id)
      .eq('product_id', productId);

    if (error) {
      console.error('Error updating quantity:', error);
      alert('Failed to update quantity: ' + error.message);
    }
  };

  const removeItem = async (productId: string) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)
      .eq('product_id', productId);

    if (error) {
      console.error('Error removing item:', error);
      alert('Failed to remove item: ' + error.message);
    }
  };

  // Set Cart Receiver
  const handleReceiverChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const receiverId = val === 'none' ? null : val;

    const { error } = await supabase
      .from('carts')
      .update({ receiver_user_id: receiverId })
      .eq('id', cart.id);

    if (!error) {
      setCart((prev: any) => ({ ...prev, receiver_user_id: receiverId }));
      if (receiverId) {
        fetchReceiverWishlist(receiverId);
        fetchAISuggestions(receiverId);
      } else {
        setWishlistItems([]);
        setAiSuggestions([]);
      }
      router.refresh();
    }
  };

  // Toggle Cart Approval
  const handleApprovalToggle = async () => {
    const nextApproved = !isApprovedBySelf;
    setIsApprovedBySelf(nextApproved);

    const { error } = await supabase
      .from('cart_approvals')
      .upsert({
        cart_id: cart.id,
        user_id: user.id,
        approved: nextApproved,
      });

    if (error) {
      alert('Error updating approval status: ' + error.message);
      setIsApprovedBySelf(!nextApproved);
    }
  };

  // Split Pledge Submission
  const handlePledgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(pledgeInput);
    if (isNaN(val) || val <= 0) {
      alert('Enter a valid pledge amount.');
      return;
    }

    const { error } = await supabase
      .from('cart_contributions')
      .upsert({
        cart_id: cart.id,
        user_id: user.id,
        amount_pledged: val,
      });

    if (!error) {
      setPledgeInput('');
      fetchContributions(cart.id);
    } else {
      alert('Error saving pledge: ' + error.message);
    }
  };

  // Simulate Payments
  const handleSimulatePayment = async () => {
    const myContribution = contributions.find((c) => c.user_id === user.id);
    const pledge = myContribution ? parseFloat(myContribution.amount_pledged) : 0;

    if (pledge <= 0) {
      alert('Please enter a pledged amount first.');
      return;
    }

    const { error } = await supabase
      .from('cart_contributions')
      .upsert({
        cart_id: cart.id,
        user_id: user.id,
        amount_pledged: pledge,
        amount_paid: pledge,
        paid_at: new Date().toISOString(),
      });

    if (!error) {
      // Refresh local contributions list
      await fetchContributions(cart.id);

      // Check if this completes the cart (sum of paid >= total)
      const currentItems = cartItems;
      const totalCost = currentItems.reduce((sum, item) => sum + item.quantity * item.products.price, 0);
      
      // Let's recalculate the local paid sum immediately
      const newContributions = contributions.map(c => c.user_id === user.id ? { ...c, amount_paid: pledge } : c);
      const paidSum = newContributions.reduce((sum, c) => sum + parseFloat(c.amount_paid || 0), 0);

      if (paidSum >= totalCost) {
        // Update cart status to completed!
        const { error: completeError } = await supabase
          .from('carts')
          .update({ status: 'completed' })
          .eq('id', cart.id);

        if (!completeError) {
          setCart((prev: any) => ({ ...prev, status: 'completed' }));
        }
      }
    }
  };

  const handleStartNewGift = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('carts')
      .insert({
        ring_id: ringId,
        status: 'editing',
      })
      .select()
      .single();

    if (!error && data) {
      setCart(data);
      setCartItems([]);
      setApprovals([]);
      setContributions([]);
      setWishlistItems([]);
      setAiSuggestions([]);
      setAiError('');
      setDecryptedAddress('');
      setSurpriseGift(false);
      await loadRingData(user.id);
    } else {
      alert('Failed to start a new cart.');
    }
    setLoading(false);
  };

  // Helper wishlist panel add to cart action
  const addWishlistItemToCart = async (productId: string) => {
    try {
      const existingItem = cartItems.find((item) => item.product_id === productId);
      if (existingItem) {
        await updateQuantity(productId, 1, existingItem.quantity);
      } else {
        const { error } = await supabase.from('cart_items').insert({
          cart_id: cart.id,
          product_id: productId,
          added_by_user_id: user.id,
          quantity: 1,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error('Failed to add wishlist item to cart:', err);
      alert('Error adding item to cart: ' + (err?.message || err));
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="logo-ring" style={{ width: '40px', height: '40px', border: '4px solid var(--color-gold)', marginBottom: '16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading cart contents...</p>
        </div>
      </div>
    );
  }

  // Surprise Gift Overlay (Hidden Cart Rule)
  if (surpriseGift) {
    return (
      <div className="container flex-center" style={{ minHeight: 'calc(100vh - 120px)', padding: '40px 24px' }}>
        <div className="card card-glow" style={{ maxWidth: '540px', width: '100%', padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--color-gold-light)', borderRadius: '50%', color: 'var(--color-gold)', marginBottom: '24px' }}>
            <Gift size={40} className="float" style={{ animation: 'float 3s ease-in-out infinite' }} />
          </div>
          
          <h1 style={{ fontSize: '32px', fontWeight: '800', background: 'linear-gradient(135deg, var(--color-gold) 0%, #fff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '16px' }}>
            A Surprise is Preparing! 🎁
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
            To keep the shopping experience exciting, this cart has been hidden. The other Ring members are planning a surprise gift for you. You will be notified once the gift has been successfully purchased and is on its way!
          </p>

          <Link href="/dashboard" className="btn btn-primary" style={{ padding: '12px 24px' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalCost = cartItems.reduce((sum, item) => sum + item.quantity * item.products.price, 0);
  const paidSum = contributions.reduce((sum, c) => sum + parseFloat(c.amount_paid || 0), 0);
  const pledgedSum = contributions.reduce((sum, c) => sum + parseFloat(c.amount_pledged || 0), 0);
  const moneyLeftToPay = Math.max(0, totalCost - paidSum);
  const paidProgress = totalCost > 0 ? (paidSum / totalCost) * 100 : 0;

  return (
    <div className="container" style={{ padding: '40px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href={`/ring/${ringId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Ring Group
        </Link>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>
          Group Cart & Payments
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Ring: <span style={{ color: 'white', fontWeight: 600 }}>{ring?.name}</span>
        </p>
      </div>

      {/* Cart Completed State */}
      {cart.status === 'completed' && (
        <div className="card text-center" style={{ padding: '48px 32px', textAlign: 'center', background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 80%)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--color-green-light)', borderRadius: '50%', color: 'var(--color-green)', marginBottom: '24px' }}>
            <CheckCircle size={44} />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>Order Placed! 🎉</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '500px', margin: '0 auto 24px' }}>
            The group gift has been fully funded and the order has been submitted. Shipping details will be sent to the recipient.
          </p>

          <div style={{ maxWidth: '400px', margin: '0 auto 32px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-color)', textAlign: 'left' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '12px' }}>Contributors Summary</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {contributions.map((c) => (
                <div key={c.user_id} className="flex-between" style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{c.profiles?.name || 'Member'}</span>
                  <span style={{ fontWeight: '600', color: 'var(--color-green)' }}>Paid ₹{parseFloat(c.amount_paid).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleStartNewGift} className="btn btn-primary">
            Start a New Group Gift
          </button>
        </div>
      )}

      {cart.status !== 'completed' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '40px', alignItems: 'start' }}>
          
          {/* Main Cart Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
            
            {/* Cart Lock Alert in Payment Phase */}
            {cart.status === 'pending_payment' && (
              <div style={{ padding: '16px 20px', background: 'var(--color-gold-light)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Lock size={20} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  <strong>Cart Locked!</strong> The collaborative editing phase is complete. Items are locked, and split payments are active. The cart will revert if not paid within 1 hour.
                </div>
              </div>
            )}

            {/* Cart Items List */}
            <div className="card">
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingBag size={20} style={{ color: 'var(--color-gold)' }} /> Shopping Bag
              </h3>

              {cartItems.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ marginBottom: '16px' }}>Your group cart is currently empty.</p>
                  <Link href="/" className="btn btn-secondary" style={{ fontSize: '13px' }}>
                    Browse Products
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {cartItems.map((item) => (
                    <div
                      key={item.product_id}
                      style={{
                        display: 'flex',
                        gap: '16px',
                        paddingBottom: '20px',
                        borderBottom: '1px solid var(--border-color)',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <img
                        src={item.products.image_url}
                        alt={item.products.name}
                        style={{ width: '70px', height: '70px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                      
                      <div style={{ flexGrow: 1, minWidth: '150px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                          {item.products.name}
                        </h4>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', color: 'var(--color-gold)', fontWeight: 600 }}>
                            ₹{item.products.price.toLocaleString()}
                          </span>
                          <span className="badge badge-gold" style={{ fontSize: '8px', padding: '2px 6px' }}>
                            Added by {item.profiles?.name || 'Member'}
                          </span>
                        </div>
                      </div>

                      {/* Quantity Toggles */}
                      {cart.status === 'editing' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
                          <button
                            onClick={() => updateQuantity(item.product_id, -1, item.quantity)}
                            className="btn-icon"
                            style={{ padding: '4px', background: 'none', border: 'none' }}
                          >
                            <Minus size={12} />
                          </button>
                          <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product_id, 1, item.quantity)}
                            className="btn-icon"
                            style={{ padding: '4px', background: 'none', border: 'none' }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          Qty: {item.quantity}
                        </span>
                      )}

                      {/* Delete Button */}
                      {cart.status === 'editing' && (
                        <button
                          onClick={() => removeItem(item.product_id)}
                          className="btn-icon"
                          style={{ color: 'var(--color-rose)', padding: '8px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="flex-between" style={{ padding: '10px 0', borderTop: '2px solid var(--border-color)' }}>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)' }}>Total Value:</span>
                    <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-gold)' }}>
                      ₹{totalCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Editing Phase: Receiver and Approvals */}
            {cart.status === 'editing' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
                
                {/* Receiver Selector Card */}
                <div className="card">
                  <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Gift size={20} style={{ color: 'var(--color-gold)' }} /> Who is this gift for?
                  </h3>
                  
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                    Select a Ring member to surprise. Setting a receiver triggers the <strong>Hidden Cart Rule</strong>, making this cart invisible to them!
                  </p>

                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <select
                      value={cart.receiver_user_id || 'none'}
                      onChange={handleReceiverChange}
                      className="form-input"
                      style={{ cursor: 'pointer', background: 'var(--bg-card-hover)' }}
                    >
                      <option value="none">No specific receiver (Visible to all members)</option>
                      {members
                        .filter((m) => m.user_id !== user?.id) // Exclude oneself from being selected as receiver of a surprise
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.name} ({m.profiles?.email})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Wishlist & AI Suggestions Helper Panel */}
                {cart.receiver_user_id && (wishlistItems.length > 0 || aiSuggestions.length > 0 || aiLoading || aiError) && (
                  <div className="card" style={{ border: '1px solid rgba(212,175,55,0.3)', background: 'radial-gradient(circle at bottom, rgba(212,175,55,0.03) 0%, transparent 70%)' }}>
                    
                    {/* User Wishlist Sub-section */}
                    {wishlistItems.length > 0 && (
                      <div style={{ marginBottom: (aiSuggestions.length > 0 || aiLoading || aiError) ? '24px' : '0' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-gold)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Heart size={18} fill="var(--color-gold)" /> Wishlist Helper Panel
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '20px' }}>
                          Here is what they wished for. Click to add them directly to the group cart:
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px' }}>
                          {wishlistItems.map((prod) => (
                            <div
                              key={prod.id}
                              style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                              }}
                            >
                              <img
                                src={prod.image_url}
                                alt={prod.name}
                                style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover', marginBottom: '8px' }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'white', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                {prod.name}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--color-gold)', display: 'block', marginBottom: '8px' }}>
                                ₹{prod.price.toLocaleString()}
                              </span>
                              <button
                                onClick={() => addWishlistItemToCart(prod.id)}
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '10px', width: '100%', borderRadius: '4px' }}
                              >
                                Add to Cart
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Divider */}
                    {wishlistItems.length > 0 && (aiSuggestions.length > 0 || aiLoading || aiError) && (
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '24px 0' }}></div>
                    )}

                    {/* AI Suggestions Sub-section */}
                    {(aiSuggestions.length > 0 || aiLoading || aiError) && (
                      <div>
                        <div className="flex-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                          <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                            <Sparkles size={16} /> AI Suggested Gifts
                          </h4>
                          <button
                            type="button"
                            onClick={() => fetchAISuggestions(cart.receiver_user_id, true)}
                            disabled={aiLoading}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            Refresh suggestions
                          </button>
                        </div>

                        {aiLoading && (
                          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                            Thinking of the perfect gift suggestions...
                          </div>
                        )}

                        {aiError && !aiLoading && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', marginBottom: '12px' }}>
                            ⚠️ AI suggestions unavailable right now.
                          </div>
                        )}

                        {!aiLoading && !aiError && aiSuggestions.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                            {aiSuggestions.map(({ product: prod, reason }) => (
                              <div
                                key={prod.id}
                                style={{
                                  background: 'rgba(0,0,0,0.2)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  textAlign: 'center',
                                  justifyContent: 'space-between',
                                  minHeight: '230px'
                                }}
                              >
                                <div>
                                  <img
                                    src={prod.image_url}
                                    alt={prod.name}
                                    style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover', marginBottom: '8px' }}
                                  />
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'white', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', marginBottom: '2px' }}>
                                    {prod.name}
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'var(--color-gold)', display: 'block', marginBottom: '6px' }}>
                                    ₹{prod.price.toLocaleString()}
                                  </span>
                                  <p style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.3', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: 'left' }}>
                                    <strong>AI Reason:</strong> {reason}
                                  </p>
                                </div>
                                <button
                                  onClick={() => addWishlistItemToCart(prod.id)}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 8px', fontSize: '10px', width: '100%', borderRadius: '4px' }}
                                >
                                  Add to Cart
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

                {/* Approval State Card */}
                <div className="card">
                  <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckSquare size={20} style={{ color: 'var(--color-gold)' }} /> Cart Approvals
                  </h3>

                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                    Every accepted member of this Ring must check "Approve" to lock the cart and unlock split payments. Editing items resets all approvals.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
                    {members
                      .filter((m) => m.user_id !== cart.receiver_user_id) // Exclude the surprise receiver since they can't see the cart
                      .map((member) => {
                        const approvedObj = approvals.find((a) => a.user_id === member.user_id);
                        const isApproved = !!approvedObj?.approved;

                        return (
                          <div
                            key={member.user_id}
                            className="flex-between"
                            style={{
                              padding: '10px 16px',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {member.profiles?.name} {member.user_id === user?.id && '(You)'}
                            </span>
                            <span
                              className={`badge ${isApproved ? 'badge-green' : 'badge-rose'}`}
                              style={{ fontSize: '10px', padding: '3px 8px' }}
                            >
                              {isApproved ? 'Approved' : 'Waiting'}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <button
                    onClick={handleApprovalToggle}
                    className={`btn ${isApprovedBySelf ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ width: '100%', padding: '14px' }}
                    disabled={cartItems.length === 0}
                  >
                    {isApprovedBySelf ? 'Withdraw My Approval' : 'Approve Shared Cart'}
                  </button>
                </div>

              </div>
            )}

            {/* Payment Phase: Split Payments */}
            {cart.status === 'pending_payment' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
                
                {/* Live Progress Bar & Contributions */}
                <div className="card">
                  <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={20} style={{ color: 'var(--color-gold)' }} /> Live Payment Progress
                  </h3>

                  <div style={{ marginBottom: '28px' }}>
                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Collected: ₹{paidSum.toLocaleString()}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Goal: ₹{totalCost.toLocaleString()}</span>
                    </div>

                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${paidProgress}%` }}></div>
                    </div>

                    <div className="flex-between" style={{ marginTop: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>
                        {paidProgress.toFixed(0)}% Funded
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-gold)' }}>
                        ₹{moneyLeftToPay.toLocaleString()} Left
                      </span>
                    </div>
                  </div>

                  {/* Contributions List */}
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '12px' }}>Pledges & Payments</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                    {members
                      .filter((m) => m.user_id !== cart.receiver_user_id) // Receiver doesn't participate in payment
                      .map((member) => {
                        const contrib = contributions.find((c) => c.user_id === member.user_id);
                        const pledged = contrib ? parseFloat(contrib.amount_pledged) : 0;
                        const paid = contrib ? parseFloat(contrib.amount_paid) : 0;
                        const hasPaid = paid > 0 && paid >= pledged;

                        return (
                          <div
                            key={member.user_id}
                            style={{
                              padding: '12px 16px',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '10px',
                            }}
                          >
                            <div>
                              <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white' }}>
                                {member.profiles?.name} {member.user_id === user?.id && '(You)'}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Pledged: ₹{pledged.toLocaleString()}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: hasPaid ? 'var(--color-green)' : 'var(--color-rose)' }}>
                                {hasPaid ? 'Paid' : 'Unpaid'}
                              </span>
                              <span className={`badge ${hasPaid ? 'badge-green' : 'badge-rose'}`} style={{ fontSize: '9px' }}>
                                ₹{paid.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Input Pledge & Pay Simulation */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '16px' }}>Your Share</h4>
                    
                    <form onSubmit={handlePledgeSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ position: 'relative', flexGrow: 1 }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>₹</span>
                        <input
                          type="number"
                          placeholder="Pledge your share amount (e.g. 500)"
                          value={pledgeInput}
                          onChange={(e) => setPledgeInput(e.target.value)}
                          className="form-input"
                          style={{ paddingLeft: '32px' }}
                          min="1"
                        />
                      </div>
                      <button type="submit" className="btn btn-secondary">Pledge</button>
                    </form>

                    <button
                      onClick={handleSimulatePayment}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px' }}
                    >
                      <DollarSign size={16} /> Simulate Payment (Pay My Share)
                    </button>
                  </div>
                </div>

                {/* Decrypted Shipping Address */}
                {cart.receiver_user_id && (
                  <div className="card">
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <MapPin size={20} style={{ color: 'var(--color-gold)' }} /> Shipping Destination
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                      Shipping address of the gift recipient (decrypted securely from database):
                    </p>

                    {loadingAddress ? (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Decrypting address...</div>
                    ) : decryptedAddress ? (
                      <div
                        style={{
                          padding: '16px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '14px',
                          color: 'white',
                          fontWeight: 500,
                          lineHeight: '1.6',
                        }}
                      >
                        {decryptedAddress}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--color-rose)' }}>
                        Failed to load decrypted shipping address.
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
