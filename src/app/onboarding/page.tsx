'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Sparkles, CheckCircle } from 'lucide-react';

export default function OnboardingPage() {
  const [birthday, setBirthday] = useState('');
  const [address, setAddress] = useState('');
  const [giftPreferences, setGiftPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const getWordCount = (str: string) => {
    const cleanStr = str.trim();
    if (!cleanStr) return 0;
    return cleanStr.split(/\s+/).length;
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!birthday || !address || !giftPreferences) {
      setErrorMsg('All fields are required.');
      setLoading(false);
      return;
    }

    const words = getWordCount(giftPreferences);
    if (words < 50 || words > 100) {
      setErrorMsg(`Gift preferences must be between 50 and 100 words (currently ${words} words).`);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ birthday, address, gift_preferences: giftPreferences }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorMsg(result.error || 'Failed to complete onboarding.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: 'calc(100vh - 120px)', padding: '24px 0' }}>
      <div className="card card-glow" style={{ width: '100%', maxWidth: '480px', padding: '40px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--color-gold-light)', borderRadius: '50%', color: 'var(--color-gold)', marginBottom: '16px' }}>
            <Sparkles size={28} />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', background: 'linear-gradient(135deg, var(--color-gold) 0%, #fff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
            Complete Your Profile
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            To participate in Rings, split payments, and receive surprise gifts, we need your birthday and shipping address.
          </p>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--color-rose-light)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: 'var(--color-rose)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '24px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleOnboarding}>
          {/* Birthday Field */}
          <div className="form-group">
            <label className="form-label" htmlFor="birthday">
              Birthday
            </label>
            <div style={{ position: 'relative' }}>
              <Calendar size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="birthday"
                type="date"
                required
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '48px' }}
                disabled={loading}
              />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
              Used to notify your Ring members so they can surprise you!
            </span>
          </div>

          {/* Address Field */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="address">
              Shipping Address
            </label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
              <textarea
                id="address"
                required
                placeholder="123 Luxury Lane, Suite 100, Beverly Hills, CA 90210"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '48px', minHeight: '80px', resize: 'vertical', paddingTop: '14px' }}
                disabled={loading}
              />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
              🔒 Encrypted at rest. Only shared with group buyers when ordering.
            </span>
          </div>

          {/* Gift Preferences Field */}
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-label" htmlFor="giftPreferences" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span>Gift Preferences (50-100 words)</span>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: getWordCount(giftPreferences) < 50 || getWordCount(giftPreferences) > 100 ? 'var(--color-rose)' : 'var(--color-green)' }}>
                {getWordCount(giftPreferences)} words
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <Sparkles size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
              <textarea
                id="giftPreferences"
                required
                placeholder="Describe your styling tastes (e.g. gold jewellery stackers, minimalist, size 7, rose gold accents, favorite materials, or style preferences)."
                value={giftPreferences}
                onChange={(e) => setGiftPreferences(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '48px', minHeight: '120px', resize: 'vertical', paddingTop: '14px' }}
                disabled={loading}
              />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
              Helps friends select the perfect jewelry stack or custom gift for you.
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px' }}
            disabled={loading}
          >
            {loading ? 'Saving Profile...' : 'Complete Setup'} <CheckCircle size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
