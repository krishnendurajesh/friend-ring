'use client';

import React, { useState } from 'react';
import { Heart, Plus, ShoppingBag, Gift } from 'lucide-react';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
}

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onWishlistToggle: () => Promise<void>;
  userRings: { id: string; name: string }[];
  onAddToCart: (ringId: string, quantity: number) => Promise<void>;
}

export default function ProductCard({
  product,
  isWishlisted,
  onWishlistToggle,
  userRings,
  onAddToCart,
}: ProductCardProps) {
  const [showRingSelect, setShowRingSelect] = useState(false);
  const [adding, setAdding] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  const handleWishlist = async () => {
    if (wishlistLoading) return;
    setWishlistLoading(true);
    await onWishlistToggle();
    setWishlistLoading(false);
  };

  const handleAddClick = async (ringId: string) => {
    setAdding(true);
    await onAddToCart(ringId, 1);
    setAdding(false);
    setShowRingSelect(false);
  };

  return (
    <div className="card card-glow" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Product Image */}
      <div style={{ position: 'relative', width: '100%', height: '200px', backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
        <img
          src={product.image_url}
          alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
          onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        />
        
        {/* Wishlist Button */}
        <button
          onClick={handleWishlist}
          disabled={wishlistLoading}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            padding: '8px',
            color: isWishlisted ? 'var(--color-rose)' : 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition-fast)',
          }}
          title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
        >
          <Heart size={16} fill={isWishlisted ? 'var(--color-rose)' : 'none'} />
        </button>

        {/* Category Badge */}
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
          {product.category}
        </span>
      </div>

      {/* Product Info */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: 'white' }}>
          {product.name}
        </h3>
        
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', flexGrow: 1, lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.description}
        </p>

        <div className="flex-between" style={{ marginTop: 'auto', gap: '12px' }}>
          <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-gold)' }}>
            ₹{product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>

          {/* Add to Group Gift Trigger */}
          <div style={{ position: 'relative' }}>
            {userRings.length === 0 ? (
              <button
                disabled
                className="btn btn-secondary"
                style={{ padding: '8px 12px', fontSize: '12px', opacity: 0.5 }}
                title="Create or join a Ring first to start group gifting"
              >
                <Gift size={14} /> Group Gift
              </button>
            ) : (
              <button
                onClick={() => setShowRingSelect(!showRingSelect)}
                className="btn btn-primary"
                style={{ padding: '8px 12px', fontSize: '12px' }}
              >
                <Plus size={14} /> Group Gift
              </button>
            )}

            {/* Ring Select Dropdown */}
            {showRingSelect && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '42px',
                  right: '0',
                  background: 'var(--bg-card-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 20,
                  width: '180px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Add to which Ring?
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {userRings.map((ring) => (
                    <button
                      key={ring.id}
                      disabled={adding}
                      onClick={() => handleAddClick(ring.id)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ring.name}
                      </span>
                      <ShoppingBag size={12} style={{ color: 'var(--color-gold)' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
