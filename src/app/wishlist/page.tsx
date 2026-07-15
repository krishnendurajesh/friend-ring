'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Heart, ArrowLeft, HeartOff, Trash2, ArrowRight } from 'lucide-react';

export default function WishlistPage() {
  const [user, setUser] = useState<any>(null);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchWishlist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);

      // Fetch user's wishlist
      const { data, error } = await supabase
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
        .eq('user_id', user.id);

      if (!error && data) {
        setWishlist(data.map((w: any) => w.products).filter(Boolean));
      }
      setLoading(false);
    };

    fetchWishlist();
  }, [router]);

  const handleRemove = async (productId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('wishlists')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);

    if (!error) {
      setWishlist((prev) => prev.filter((p) => p.id !== productId));
    } else {
      alert('Failed to remove item: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="logo-ring" style={{ width: '40px', height: '40px', border: '4px solid var(--color-gold)', marginBottom: '16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your wishlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      <div className="flex-between" style={{ marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, var(--text-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Heart size={32} fill="var(--color-rose)" style={{ color: 'var(--color-rose)' }} /> Your Wishlist
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Products you have pinned. Other ring members will see these helper tips when buying a surprise gift for you!
          </p>
        </div>
      </div>

      {wishlist.length === 0 ? (
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
            <HeartOff size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Your Wishlist is Empty</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Explore our premium jewelry catalog and pin products that you would love to receive as surprise gifts!
            </p>
            <Link href="/" className="btn btn-primary">
              Browse Catalog <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="product-grid">
          {wishlist.map((prod) => (
            <div
              key={prod.id}
              className="card card-glow"
              style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Product Image */}
              <div style={{ position: 'relative', width: '100%', height: '200px', backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                <img
                  src={prod.image_url}
                  alt={prod.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                
                {/* Delete/Remove button */}
                <button
                  onClick={() => handleRemove(prod.id)}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'rgba(244,63,94,0.15)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(244,63,94,0.3)',
                    borderRadius: '50%',
                    padding: '8px',
                    color: 'var(--color-rose)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'var(--transition-fast)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--color-rose)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(244,63,94,0.15)')}
                  title="Remove from Wishlist"
                >
                  <Trash2 size={14} />
                </button>

                <span
                  className="badge badge-gold"
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    backdropFilter: 'blur(4px)',
                    background: 'rgba(43, 40, 20, 0.7)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                  }}
                >
                  {prod.category}
                </span>
              </div>

              {/* Product Info */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: 'white' }}>
                  {prod.name}
                </h3>
                
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', flexGrow: 1, lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {prod.description}
                </p>

                <div className="flex-between" style={{ marginTop: 'auto' }}>
                  <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-gold)' }}>
                    ₹{prod.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
