import React, { useState, useEffect, } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { getCredits, getPurchaseHistory } from '../gigSystem';
import '../Profile.css';

const CACHE_KEY_SETTINGS = 'gigscourt_settings';
const CACHE_KEY_CREDITS = 'gigscourt_settings_credits';

function getCached(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function setCached(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const CREDIT_PACKAGES = [
  { credits: 3, amount: 150000, label: '3 Credits', price: '₦1,500' },
  { credits: 5, amount: 225000, label: '5 Credits', price: '₦2,250' },
  { credits: 8, amount: 340000, label: '8 Credits', price: '₦3,400' },
  { credits: 10, amount: 400000, label: '10 Credits', price: '₦4,000' },
];

const IconBack = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

function SettingsScreen({ onBack, onLogout, isVisible }) {
  const cachedSettings = getCached(CACHE_KEY_SETTINGS);
  const cachedCredits = getCached(CACHE_KEY_CREDITS);

  const [showPhone, setShowPhone] = useState(cachedSettings?.showPhone ?? true);
  const [pushEnabled, setPushEnabled] = useState(cachedSettings?.pushEnabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(cachedSettings?.emailEnabled ?? false);
  const [credits, setCredits] = useState(cachedCredits ?? 0);
  const [loading, setLoading] = useState(!cachedSettings);
  const [showPackages, setShowPackages] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showCreditHistory, setShowCreditHistory] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showContactSupport, setShowContactSupport] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isVisible) loadSettings();
  }, [isVisible]);

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
      setCached(CACHE_KEY_SETTINGS, {
        showPhone: data.show_phone !== false,
        pushEnabled: data.push_enabled !== false,
        emailEnabled: data.email_enabled === true,
      });
    }

    try {
      const balance = await getCredits(user.id);
      setCredits(balance);
      setCached(CACHE_KEY_CREDITS, balance);
    } catch (err) {
      console.error('Failed to load credits:', err);
    }

    setLoading(false);
  };

  const toggleShowPhone = async () => {
    const newValue = !showPhone;
    setShowPhone(newValue);
    setCached(CACHE_KEY_SETTINGS, { showPhone: newValue, pushEnabled, emailEnabled });
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      show_phone: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const togglePush = async () => {
    const newValue = !pushEnabled;
    setPushEnabled(newValue);
    setCached(CACHE_KEY_SETTINGS, { showPhone, pushEnabled: newValue, emailEnabled });
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      push_enabled: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const toggleEmail = async () => {
    const newValue = !emailEnabled;
    setEmailEnabled(newValue);
    setCached(CACHE_KEY_SETTINGS, { showPhone, pushEnabled, emailEnabled: newValue });
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({
      email_enabled: newValue,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const handleBuyCredits = async (pkg) => {
    setShowPackages(false);
    setPaying(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setPaying(false);
      return;
    }

    const handler = window.PaystackPop.setup({
      key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: pkg.amount,
      ref: `gigs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        user_id: user.id,
        credits: pkg.credits,
      },
      onSuccess: () => {
        setTimeout(async () => {
          const balance = await getCredits(user.id);
          setCredits(balance);
          setCached(CACHE_KEY_CREDITS, balance);
        }, 2000);
        setPaying(false);
      },
      onClose: () => {
        setPaying(false);
      },
    });

    handler.openIframe();
  };

  const handleOpenCreditHistory = async () => {
    setShowCreditHistory(true);
    setLoadingHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const history = await getPurchaseHistory(user.id);
        setPurchaseHistory(history);
      }
    } catch (err) {
      console.error('Failed to load purchase history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenContactSupport = async () => {
    setShowContactSupport(true);
    setTicketSubmitted(false);
    setSupportSubject('');
    setSupportMessage('');
    setLoadingTickets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('reported_issues')
          .select('*')
          .eq('reported_by', user.id)
          .order('created_at', { ascending: false });
        setMyTickets(data || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleSubmitTicket = async () => {
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSubmittingTicket(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('reported_issues').insert({
        reported_by: user.id,
        issue_type: supportSubject.trim(),
        description: supportMessage.trim(),
        status: 'pending',
      });
      setTicketSubmitted(true);
      setSupportSubject('');
      setSupportMessage('');
      const { data } = await supabase
        .from('reported_issues')
        .select('*')
        .eq('reported_by', user.id)
        .order('created_at', { ascending: false });
      setMyTickets(data || []);
    } catch (err) {
      console.error('Failed to submit ticket:', err);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.rpc('soft_delete_user', { p_user_id: user.id });
      console.log('Delete error:', JSON.stringify(error));
      if (!error) {
        await supabase.auth.signOut();
        onLogout();
      }
    } catch (err) {
      console.error('Delete account error:', err);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatNaira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;

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
          <div className="settings-item settings-item-tappable" onClick={handleOpenCreditHistory}>
            <div className="settings-item-info">
              <span className="settings-item-label">My Credits</span>
              <span className="settings-item-sub">{credits} credits remaining</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
          <div className="settings-item settings-item-tappable" onClick={() => setShowPackages(true)}>
            <div className="settings-item-info">
              <span className="settings-item-label">Buy Credits</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Support */}
        <div className="settings-section">
          <h3 className="settings-section-title">Support</h3>
          <div className="settings-item settings-item-tappable" onClick={handleOpenContactSupport}>
            <div className="settings-item-info">
              <span className="settings-item-label">Contact Support</span>
              <span className="settings-item-sub">Get help or report an issue</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* Legal */}
        <div className="settings-section">
          <h3 className="settings-section-title">Legal</h3>
          <div className="settings-item settings-item-tappable" onClick={() => setShowTerms(true)}>
            <div className="settings-item-info">
              <span className="settings-item-label">Terms & Privacy</span>
            </div>
            <span className="settings-arrow">›</span>
          </div>
        </div>

        {/* About */}
        <div className="settings-section">
          <h3 className="settings-section-title">About</h3>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">App Version</span>
            </div>
            <span className="settings-item-value">1.0.0</span>
          </div>
        </div>

        {/* Account */}
        <div className="settings-section">
          <h3 className="settings-section-title">Account</h3>
          <button className="settings-logout-btn" onClick={onLogout}>
            Log Out
          </button>
          <button className="settings-delete-btn" onClick={() => setDeleteConfirm(true)}>
            Delete Account
          </button>
        </div>
      </div>

      {/* Credit History Sheet */}
      {showCreditHistory && (
        <div className="sheet-overlay" onClick={() => setShowCreditHistory(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Credit History</h2>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16,
                padding: '8px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)',
                fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)'
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0
                }} />
                {credits} credits remaining
              </div>
              {loadingHistory ? (
                <div className="skeleton" style={{ width: '100%', height: 40 }} />
              ) : purchaseHistory.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                  No purchases yet
                </p>
              ) : (
                purchaseHistory.map(purchase => (
                  <div key={purchase.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: '1px solid var(--color-border)'
                  }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {purchase.credits_purchased} credits
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        {formatNaira(purchase.amount_paid)}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {formatDate(purchase.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Support Sheet */}
      {showContactSupport && (
        <div className="sheet-overlay" onClick={() => setShowContactSupport(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Contact Support</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 16 }}>
                We're here to help. Submit a ticket and we'll respond promptly.
              </p>

              {ticketSubmitted && (
                <div style={{
                  background: 'rgba(52, 199, 89, 0.1)', borderRadius: 12, padding: 14, marginBottom: 16,
                  color: 'var(--color-success)', fontSize: 14, fontWeight: 500, textAlign: 'center'
                }}>
                  ✓ Ticket submitted successfully. We'll review it shortly.
                </div>
              )}

              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                Subject
              </label>
              <input
                type="text"
                value={supportSubject}
                onChange={e => setSupportSubject(e.target.value)}
                placeholder="e.g. Payment issue, Bug report..."
                className="input"
                style={{ marginBottom: 12 }}
              />

              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                Message
              </label>
              <textarea
                value={supportMessage}
                onChange={e => setSupportMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                className="textarea"
                rows={4}
                style={{ marginBottom: 12 }}
              />

              <button
                onClick={handleSubmitTicket}
                disabled={!supportSubject.trim() || !supportMessage.trim() || submittingTicket}
                className="btn-primary"
                style={{ width: '100%' }}
              >
                {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
              </button>

              {/* My Tickets */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                  My Tickets
                </h3>
                {loadingTickets ? (
                  <div className="skeleton" style={{ width: '100%', height: 40 }} />
                ) : myTickets.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>No tickets yet</p>
                ) : (
                  myTickets.map(ticket => (
                    <div key={ticket.id} style={{
                      padding: '12px 0', borderBottom: '1px solid var(--color-border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {ticket.issue_type}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                          background: ticket.status === 'resolved' ? 'rgba(52, 199, 89, 0.15)' : 'rgba(255, 149, 0, 0.15)',
                          color: ticket.status === 'resolved' ? 'var(--color-success)' : '#e65100'
                        }}>
                          {ticket.status === 'resolved' ? 'Resolved' : 'Pending'}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0' }}>
                        {ticket.description}
                      </p>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {formatDate(ticket.created_at)}
                      </span>
                      {ticket.status === 'resolved' && ticket.response_text && (
                        <div style={{
                          marginTop: 8, padding: '10px 14px', borderRadius: 10,
                          background: 'rgba(52, 199, 89, 0.06)', borderLeft: '3px solid var(--color-success)'
                        }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', marginBottom: 3 }}>
                            Response from GigsCourt:
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
                            {ticket.response_text}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terms & Privacy Sheet */}
      {showTerms && (
        <div className="sheet-overlay" onClick={() => setShowTerms(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              <h2>Terms of Service</h2>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>Last updated: 2026</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>1. Acceptance of Terms</p>
              <p style={{ marginBottom: 12 }}>By using GigsCourt, you agree to these terms. If you do not agree, please do not use the app.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>2. Description of Service</p>
              <p style={{ marginBottom: 12 }}>GigsCourt is a location-based marketplace that connects service providers with clients in their area. Users can browse providers, chat, register completed gigs, and leave reviews.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>3. User Accounts</p>
              <p style={{ marginBottom: 12 }}>You are responsible for maintaining the confidentiality of your account. You may delete your account at any time from Settings. If you sign up again with the same email, you will start fresh with a new profile.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>4. Credits and Payments</p>
              <p style={{ marginBottom: 12 }}>Credits are used to register gigs and receive reviews. All credit purchases are final. Credits have no cash value and cannot be redeemed for money. GigsCourt reserves the right to modify credit pricing.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>5. User Conduct</p>
              <p style={{ marginBottom: 12 }}>Users agree not to misuse the platform, harass other users, post false reviews, manipulate the rating system, or use the app for any illegal purpose. Violation may result in account suspension.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>6. Limitation of Liability</p>
              <p style={{ marginBottom: 12 }}>GigsCourt is a platform for connecting users and is not a party to any agreement between providers and clients. We do not guarantee the quality of services or the accuracy of user profiles.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>7. Contact</p>
              <p style={{ marginBottom: 24 }}>For questions about these terms, contact us at theprimestarventures@gmail.com.</p>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 16px 0' }} />

              <h2>Privacy Policy</h2>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>Last updated: 2026</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>1. Information We Collect</p>
              <p style={{ marginBottom: 12 }}>We collect your name, phone number, email, profile picture, services, and workspace location. We also collect messages and gig history.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>2. How We Use Your Information</p>
              <p style={{ marginBottom: 12 }}>Your profile is visible to other users to facilitate connections. Your phone number is visible only if you choose to show it. Your email is never publicly displayed.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>3. Data Sharing</p>
              <p style={{ marginBottom: 12 }}>We do not sell your personal information. We share data only as necessary to provide the service.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>4. Data Retention</p>
              <p style={{ marginBottom: 12 }}>We retain your information as long as your account exists. If you delete your account, your profile is removed. Messages and gig history may be retained for the integrity of other users' records.</p>

              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>5. Contact</p>
              <p style={{ marginBottom: 12 }}>For privacy inquiries, contact us at theprimestarventures@gmail.com.</p>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation */}
      {deleteConfirm && (
        <div className="sheet-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Delete Account</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 16 }}>
                Are you sure you want to delete your account? This will permanently remove your profile, photos, and all personal information.
              </p>
              <ul style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Your conversations and gig history will be preserved for other users</li>
                <li>You can sign up again with the same email, but you will not receive new free credits</li>
                <li>This action cannot be undone</li>
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: 'var(--space-md) var(--space-2xl)',
                    background: 'var(--color-destructive)', color: '#FFFFFF',
                    border: 'none', borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer', opacity: deleting ? 0.6 : 1
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buy Credits Sheet — portaled */}
      {showPackages && ReactDOM.createPortal(
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
        </div>,
        document.getElementById('portal-root')
      )}
    </div>
  );
}

export default SettingsScreen;
