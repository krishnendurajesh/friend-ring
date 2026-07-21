'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import ProductCard, { Product } from '@/components/ProductCard';
import { Sparkles, Heart, Gift, Users, ShoppingBag } from 'lucide-react';

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<any>(null);
  const [wishlistProductIds, setWishlistProductIds] = useState<string[]>([]);
  const [userRings, setUserRings] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  const supabase = createClient();
  const router = useRouter();

  // Categories list
  const categories = ['All', 'Rings', 'Bracelets', 'Necklaces', 'Earrings', 'Gift Boxes'];

  useEffect(() => {
    const initCatalog = async () => {
      await fetchProducts();

      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        await fetchWishlist(user.id);
        await fetchUserRings(user.id);
      }
      setLoading(false);
    };

    initCatalog();
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('price', { ascending: true });

    if (data) {
      setProducts(data as Product[]);
    }
  };

  const fetchWishlist = async (userId: string) => {
    const { data } = await supabase
      .from('wishlists')
      .select('product_id')
      .eq('user_id', userId);

    if (data) {
      setWishlistProductIds(data.map((w: any) => w.product_id));
    }
  };

  const fetchUserRings = async (userId: string) => {
    const { data } = await supabase
      .from('ring_members')
      .select(`
        ring_id,
        rings (
          id,
          name
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'accepted');

    if (data) {
      const formatted = data
        .map((r: any) => r.rings)
        .filter(Boolean);
      setUserRings(formatted);
    }
  };

  const handleWishlistToggle = async (productId: string) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const isPinned = wishlistProductIds.includes(productId);

    if (isPinned) {
      // Remove
      const { error } = await supabase
        .from('wishlists')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);

      if (!error) {
        setWishlistProductIds((prev) => prev.filter((id) => id !== productId));
      }
    } else {
      // Add
      const { error } = await supabase
        .from('wishlists')
        .insert({
          user_id: user.id,
          product_id: productId,
        });

      if (!error) {
        setWishlistProductIds((prev) => [...prev, productId]);
      }
    }
  };

  const handleAddToCart = async (ringId: string, productId: string, quantity = 1) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    try {
      // 1. Fetch active cart for the ring
      const { data: cartData, error: cartError } = await supabase
        .from('carts')
        .select('id, status, receiver_user_id')
        .eq('ring_id', ringId)
        .in('status', ['editing', 'locked', 'ready_for_payment', 'pending_payment'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cartError || !cartData) {
        alert('Could not locate an active cart for this Ring. You might be blocked by the surprise-receiver RLS rule, or the cart is currently completed.');
        return;
      }

      if (cartData.status !== 'editing') {
        alert('This cart is currently locked in the payment phase. You cannot add items right now.');
        return;
      }

      // If user is the receiver, they will be blocked by RLS anyway, but check locally to be friendly
      if (cartData.receiver_user_id === user.id) {
        alert('You cannot add items to this cart because it is a surprise gift cart designated for you! 🎁');
        return;
      }

      // 2. Check if item is already in the cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('cart_id', cartData.id)
        .eq('product_id', productId)
        .single();

      if (existingItem) {
        // Update quantity
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('cart_id', cartData.id)
          .eq('product_id', productId);

        if (error) throw error;
      } else {
        // Insert item
        const { error } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cartData.id,
            product_id: productId,
            added_by_user_id: user.id,
            quantity: quantity,
          });

        if (error) throw error;
      }

      alert('Product added to Ring Shared Cart! 🛒');
    } catch (err: any) {
      console.error(err);
      alert('Failed to add product to group cart. You might not have permission (RLS check).');
    }
  };

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter((p) => p.category === selectedCategory);

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="logo-ring" style={{ width: '40px', height: '40px', border: '4px solid var(--color-gold)', marginBottom: '16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading catalog products...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <h1 className="hero-title">
            Surprise Gifting, <br />
            <span style={{ background: 'linear-gradient(135deg, var(--color-gold) 0%, #fff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Split Collaboratively.
            </span>
          </h1>
          <p className="hero-subtitle">
            Welcome to Friend Ring! Browse our premium jewelry catalog, add items to shared group carts, split payments, and purchase gifts for friends without ruining the surprise.
          </p>
        </div>
      </section>

      {/* Main Catalog Content */}
      <section style={{ padding: '40px 0 80px' }}>
        <div className="container">
          {/* Category Filter Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '40px',
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`btn ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '30px' }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
              No products found in this category.
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isWishlisted={wishlistProductIds.includes(product.id)}
                  onWishlistToggle={() => handleWishlistToggle(product.id)}
                  userRings={userRings}
                  onAddToCart={(ringId, qty) => handleAddToCart(ringId, product.id, qty)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
