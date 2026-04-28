import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCredits } from '../gigSystem';

function SettingsScreen({ onBack, onLogout }) {
  const [showPhone, setShowPhone] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

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

  const handleBuyCredits = () => {
    alert('Credit purchase will be available soon via Paystack.');
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
        <button onClick={onBack} className="settings-back">←</button>
        <h2>Settings</h2>
        <span style={{ width: 50 }} />
      </div>

      <div className="settings-body">
        {/* Privacy */}
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

        {/* Notifications */}
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

        {/* Credits */}
        <div className="settings-section">
          <h3 className="settings-section-title">Credits</h3>
          <div className="settings-item" onClick={handleBuyCredits} style={{ cursor: 'pointer' }}>
            <div className="settings-item-info">
              <span className="settings-item-label">My Credits</span>
              <span className="settings-item-sub">{credits} credits remaining</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Support */}
        <div className="settings-section">
          <h3 className="settings-section-title">Support</h3>
          <div className="settings-item" onClick={() => alert('Help & Support coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Help & Support</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item" onClick={() => alert('Report a Problem coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Report a Problem</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Legal */}
        <div className="settings-section">
          <h3 className="settings-section-title">Legal</h3>
          <div className="settings-item" onClick={() => alert('Terms of Service coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Terms of Service</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item" onClick={() => alert('Privacy Policy coming soon.')}>
            <div className="settings-item-info">
              <span className="settings-item-label">Privacy Policy</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* App Info */}
        <div className="settings-section">
          <h3 className="settings-section-title">About</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">App Version</span>
            </div>
            <span className="settings-item-value">1.0.0</span>
          </div>
        </div>

        {/* Logout */}
        <button className="settings-logout-btn" onClick={onLogout}>
          Log Out
        </button>

        {/* Delete Account */}
        <button className="settings-delete-btn" onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
    </div>
  );
}

export default SettingsScreen;
