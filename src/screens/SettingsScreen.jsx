import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function SettingsScreen({ onBack, onLogout }) {
  const [showPhone, setShowPhone] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('show_phone')
      .eq('id', user.id)
      .single();

    if (data) {
      setShowPhone(data.show_phone !== false);
    }
    setLoading(false);
  };

  const toggleShowPhone = async () => {
    const newValue = !showPhone;
    setShowPhone(newValue);

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').upsert({
      id: user.id,
      show_phone: newValue,
      updated_at: new Date().toISOString(),
    });
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
      {/* Header */}
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
            <button className="toggle-switch active" onClick={() => {}}>
              <span className="toggle-knob" />
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Email Notifications</span>
              <span className="settings-item-sub">Receive email updates about your account</span>
            </div>
            <button className="toggle-switch" onClick={() => {}}>
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        {/* Credits */}
        <div className="settings-section">
          <h3 className="settings-section-title">Credits</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">My Credits</span>
              <span className="settings-item-sub">View and purchase credits</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Support */}
        <div className="settings-section">
          <h3 className="settings-section-title">Support</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Help & Support</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Report a Problem</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Legal */}
        <div className="settings-section">
          <h3 className="settings-section-title">Legal</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Terms of Service</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item">
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
        <button className="settings-delete-btn">
          Delete Account
        </button>
      </div>
    </div>
  );
}

export default SettingsScreen;
