import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCredits } from '../gigSystem';
import '../Profile.css';

const IconBack = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const CREDIT_PACKAGES = [
  { credits: 3, amount: 150000, label: '3 Credits', price: '₦1,500' },
  { credits: 5, amount: 225000, label: '5 Credits', price: '₦2,250' },
  { credits: 8, amount: 340000, label: '8 Credits', price: '₦3,400' },
  { credits: 10, amount: 400000, label: '10 Credits', price: '₦4,000' },
];

function SettingsScreen({ onBack, onLogout }) {
  const [showPhone, setShowPhone] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPackages, setShowPackages] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('show_phone, push_enabled, email_enabled')
      .eq('id', user.id)
      .single();

    if (data) {
      setShowPhone(data.show_phone !== false);
      setPushEnabled(data.push_enabled !== false);
      setEmailEnabled(data.email_enabled === true);
    }

    try {
      const balance = await getCredits(user.id);
      setCredits(balance);
    } catch (err) {
      console.error('Failed to load credits:', err);
    }

    setLoading(false);
  };

  const toggleShowPhone = async () => {
    const newValue = !showPhone;
    setShowPhone(newValue);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      show_phone: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const togglePush = async () => {
    const newValue = !pushEnabled;
    setPushEnabled(newValue);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      push_enabled: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const toggleEmail = async () => {
    const newValue = !emailEnabled;
    setEmailEnabled(newValue);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      email_enabled: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const handleBuyCredits = (pkg) => {
    setShowPackages(false);
    setPaying(true);

    const { data: { user } } = supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;

      const handler = window.PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: data.user.email,
        amount: pkg.amount,
        ref: `gigs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          user_id: data.user.id,
          credits: pkg.credits,
        },
        onSuccess: () => {
          setTimeout(async () => {
            const balance = await getCredits(data.user.id);
            setCredits(balance);
          }, 2000);
          setPaying(false);
        },
        onClose: () => {
          setPaying(false);
        },
      });

      handler.openIframe();
    });
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      alert('Account deletion will be available soon.');
    }
  };

  if (loading) {
    return (
      <div className="settings-screen">
        <div className="settings-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button onClick={onBack} className="settings-back"><IconBack /></button>
        <h2>Settings</h2>
        <span style={{ width: 50 }} />
      </div>

      <div className="settings-body">
        <div className="settings-section">
          <h3 className="settings-section-title">Privacy</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Show phone number to clients</span>
              <span className="settings-item-sub">Your phone number will be visible on your profile</span>
            </div>
            <button
              className={`toggle-switch ${showPhone ? 'active' : ''}`}
              onClick={toggleShowPhone}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Notifications</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Push Notifications</span>
              <span className="settings-item-sub">Receive notifications about gigs and messages</span>
            </div>
            <button
              className={`toggle-switch ${pushEnabled ? 'active' : ''}`}
              onClick={togglePush}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Email Notifications</span>
              <span className="settings-item-sub">Receive email updates about your account</span>
            </div>
            <button
              className={`toggle-switch ${emailEnabled ? 'active' : ''}`}
              onClick={toggleEmail}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Credits</h3>
          <div className="settings-item settings-item-tappable" onClick={() => setShowPackages(true)}>
            <div className="settings-item-info">
              <span className="settings-item-label">My Credits</span>
              <span className="settings-item-sub">{credits} credits remaining</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Support</h3>
          <div className="settings-item settings-item-tappable" onClick={() => alert('Help & Support coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Help & Support</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item settings-item-tappable" onClick={() => alert('Report a Problem coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Report a Problem</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Legal</h3>
          <div className="settings-item settings-item-tappable" onClick={() => alert('Terms of Service coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Terms of Service</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item settings-item-tappable" onClick={() => alert('Privacy Policy coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Privacy Policy</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">About</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">App Version</span>
            </div>
            <span className="settings-item-value">1.0.0</span>
          </div>
        </div>

        <button className="settings-logout-btn" onClick={onLogout}>
          Log Out
        </button>

        <button className="settings-delete-btn" onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>

      {showPackages && (
        <div className="sheet-overlay" onClick={() => setShowPackages(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Buy Credits</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 16 }}>
                Credits are used to receive reviews and boost your reputation.
              </p>
              <div className="credit-packages">
                {CREDIT_PACKAGES.map((pkg) => (
                  <button
                    key={pkg.credits}
                    className="credit-package-btn"
                    onClick={() => handleBuyCredits(pkg)}
                    disabled={paying}
                  >
                    <span className="package-label">{pkg.label}</span>
                    <span className="package-price">{pkg.price}</span>
                  </button>
                ))}
              </div>
              {paying && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: 12 }}>
                  Processing payment...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsScreen;
