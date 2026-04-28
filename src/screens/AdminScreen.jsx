import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCredits } from '../gigSystem';
import '../AdminScreen.css';

function AdminScreen({ isVisible }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    totalGigs: 0,
    completedGigs: 0,
    pendingGigs: 0,
    cancelledGigs: 0,
    totalRevenue: 0,
  });
  const [signupPeriod, setSignupPeriod] = useState('day');
  const [signups, setSignups] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [topProviders, setTopProviders] = useState([]);
  const [reportedIssues, setReportedIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [editingService, setEditingService] = useState(null);
  const [editName, setEditName] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible) loadAllData();
    return () => { isMounted.current = false; };
  }, [isVisible, signupPeriod]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadStats(),
      loadSignups(),
      loadServiceRequests(),
      loadPurchases(),
      loadTopProviders(),
      loadReportedIssues(),
    ]);
    if (isMounted.current) setLoading(false);
  };

  const loadStats = async () => {
    try {
      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      
      const today = new Date().toISOString().split('T')[0];
      const { count: activeToday } = await supabase
        .from('messages')
        .select('sender_id', { count: 'exact', head: true })
        .gte('created_at', today)
        .then(({ count }) => ({ count: new Set(count).size }));

      const { count: totalGigs } = await supabase.from('gigs').select('*', { count: 'exact', head: true });
      const { count: completedGigs } = await supabase.from('gigs').select('*', { count: 'exact', head: true }).eq('status', 'completed');
      const { count: pendingGigs } = await supabase.from('gigs').select('*', { count: 'exact', head: true }).eq('status', 'pending_review');
      const { count: cancelledGigs } = await supabase.from('gigs').select('*', { count: 'exact', head: true }).eq('status', 'cancelled');

      const { data: revenue } = await supabase.from('credit_purchases').select('amount_paid').eq('status', 'completed');
      const totalRevenue = revenue ? revenue.reduce((sum, r) => sum + r.amount_paid, 0) : 0;

      if (isMounted.current) {
        setStats({
          totalUsers: totalUsers || 0,
          activeToday: activeToday || 0,
          totalGigs: totalGigs || 0,
          completedGigs: completedGigs || 0,
          pendingGigs: pendingGigs || 0,
          cancelledGigs: cancelledGigs || 0,
          totalRevenue,
        });
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
  };

  const loadSignups = async () => {
    const { data } = await supabase.rpc('get_user_signups_by_period', { p_period: signupPeriod });
    if (isMounted.current && data) setSignups(data);
  };

  const loadServiceRequests = async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('id, requested_name, status, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(50);
    if (isMounted.current && data) setServiceRequests(data);
  };

  const loadPurchases = async () => {
    const { data } = await supabase
      .from('credit_purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (isMounted.current && data) setPurchases(data);
  };

  const loadTopProviders = async () => {
    let data = null;
try {
  const result = await supabase.rpc('get_top_providers', { p_limit: 20 });
  data = result.data;
} catch (err) {
  console.error('Top providers error:', err);
}
    if (isMounted.current && data) setTopProviders(data);
  };

  const loadReportedIssues = async () => {
    const { data } = await supabase
      .from('reported_issues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (isMounted.current && data) setReportedIssues(data);
  };

  const handleApproveService = async (id) => {
    await supabase.from('service_requests').update({ status: 'approved' }).eq('id', id);
    loadServiceRequests();
  };

  const handleRejectService = async (id) => {
    await supabase.from('service_requests').update({ status: 'rejected' }).eq('id', id);
    loadServiceRequests();
  };

  const handleEditService = async (id) => {
    if (!editName.trim()) return;
    await supabase.from('service_requests').update({ requested_name: editName.trim(), status: 'approved' }).eq('id', id);
    setEditingService(null);
    setEditName('');
    loadServiceRequests();
  };

  const handleResolveIssue = async (id) => {
    await supabase.from('reported_issues').update({ status: 'resolved' }).eq('id', id);
    loadReportedIssues();
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setBroadcasting(true);
    // Get all OneSignal player IDs
    const { data: profiles } = await supabase.from('profiles').select('onesignal_player_id').not('onesignal_player_id', 'is', null);
    if (profiles && profiles.length > 0) {
      const playerIds = profiles.map(p => p.onesignal_player_id).filter(Boolean);
      const { PUSH_NOTIFICATION_URL } = await import('../lib/config');
      await fetch(PUSH_NOTIFICATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          include_player_ids: playerIds,
          headings: { en: 'GigsCourt' },
          contents: { en: broadcastMessage },
        }),
      }).catch(() => {});
      alert(`Notification sent to ${playerIds.length} users.`);
    }
    setBroadcastMessage('');
    setBroadcasting(false);
  };

  const formatNaira = (kobo) => `₦${(kobo / 100).toLocaleString()}`;

  if (loading) {
    return (
      <div className="admin-screen">
        <div className="admin-loading"><div className="spinner"></div></div>
      </div>
    );
  }

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p>GigsCourt</p>
      </div>

      {/* Section Tabs */}
      <div className="admin-tabs">
        {['dashboard', 'services', 'purchases', 'providers', 'issues', 'broadcast'].map(section => (
          <button
            key={section}
            className={`admin-tab ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
          >
            {section === 'dashboard' ? '📊 Overview' :
             section === 'services' ? '📝 Services' :
             section === 'purchases' ? '💳 Revenue' :
             section === 'providers' ? '⭐ Providers' :
             section === 'issues' ? '🚩 Issues' :
             '📢 Broadcast'}
          </button>
        ))}
      </div>

      <div className="admin-body">
        {/* DASHBOARD */}
        {activeSection === 'dashboard' && (
          <>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <span className="stat-icon">👥</span>
                <span className="stat-value">{stats.totalUsers}</span>
                <span className="stat-label-text">Total Users</span>
              </div>
              <div className="admin-stat-card">
                <span className="stat-icon">🟢</span>
                <span className="stat-value">{stats.activeToday}</span>
                <span className="stat-label-text">Active Today</span>
              </div>
              <div className="admin-stat-card">
                <span className="stat-icon">📦</span>
                <span className="stat-value">{stats.totalGigs}</span>
                <span className="stat-label-text">Total Gigs</span>
              </div>
              <div className="admin-stat-card">
                <span className="stat-icon">💰</span>
                <span className="stat-value">{formatNaira(stats.totalRevenue)}</span>
                <span className="stat-label-text">Revenue</span>
              </div>
            </div>

            <div className="admin-gig-breakdown">
              <div className="gig-breakdown-item completed">
                <span>{stats.completedGigs}</span>
                <span>Completed</span>
              </div>
              <div className="gig-breakdown-item pending">
                <span>{stats.pendingGigs}</span>
                <span>Pending</span>
              </div>
              <div className="gig-breakdown-item cancelled">
                <span>{stats.cancelledGigs}</span>
                <span>Cancelled</span>
              </div>
            </div>

            <div className="admin-section">
              <div className="admin-section-header">
                <h3>User Signups</h3>
                <div className="period-toggle">
                  {['day', 'week', 'month', 'year'].map(p => (
                    <button
                      key={p}
                      className={`period-btn ${signupPeriod === p ? 'active' : ''}`}
                      onClick={() => setSignupPeriod(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="signups-list">
                {signups.map(s => (
                  <div key={s.period} className="signup-row">
                    <span className="signup-period">{s.period}</span>
                    <span className="signup-count">{s.count} new</span>
                  </div>
                ))}
                {signups.length === 0 && <p className="empty-text">No data</p>}
              </div>
            </div>
          </>
        )}

        {/* SERVICE REQUESTS */}
        {activeSection === 'services' && (
          <div className="admin-section">
            <h3>Service Requests</h3>
            <div className="service-list">
              {serviceRequests.map(sr => (
                <div key={sr.id} className={`service-item ${sr.status}`}>
                  <div className="service-info">
                    <span className="service-name">{sr.requested_name}</span>
                    <span className={`service-status-badge ${sr.status}`}>{sr.status}</span>
                  </div>
                  <div className="service-actions">
                    {editingService === sr.id ? (
                      <>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="service-edit-input"
                        />
                        <button onClick={() => handleEditService(sr.id)} className="btn-approve">Save</button>
                        <button onClick={() => setEditingService(null)} className="btn-reject">Cancel</button>
                      </>
                    ) : (
                      <>
                        {sr.status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveService(sr.id)} className="btn-approve">Approve</button>
                            <button onClick={() => { setEditingService(sr.id); setEditName(sr.requested_name); }} className="btn-edit">Edit</button>
                            <button onClick={() => handleRejectService(sr.id)} className="btn-reject">Reject</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {serviceRequests.length === 0 && <p className="empty-text">No service requests</p>}
            </div>
          </div>
        )}

        {/* CREDIT PURCHASES */}
        {activeSection === 'purchases' && (
          <div className="admin-section">
            <h3>Credit Purchases</h3>
            <div className="purchases-list">
              {purchases.map(p => (
                <div key={p.id} className="purchase-item">
                  <div className="purchase-info">
                    <span className="purchase-amount">{formatNaira(p.amount_paid)}</span>
                    <span className="purchase-credits">{p.credits_purchased} credits</span>
                  </div>
                  <span className={`purchase-status ${p.status}`}>{p.status}</span>
                  <span className="purchase-date">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              ))}
              {purchases.length === 0 && <p className="empty-text">No purchases yet</p>}
            </div>
          </div>
        )}

        {/* TOP PROVIDERS */}
        {activeSection === 'providers' && (
          <div className="admin-section">
            <h3>Top Providers</h3>
            <div className="providers-list">
              {topProviders.map((p, i) => (
                <div key={p.id} className="provider-item">
                  <span className="provider-rank">#{i + 1}</span>
                  <span className="provider-name">{p.full_name}</span>
                  <span className="provider-gigs">{p.gig_count} gigs</span>
                </div>
              ))}
              {topProviders.length === 0 && <p className="empty-text">No providers yet</p>}
            </div>
          </div>
        )}

        {/* REPORTED ISSUES */}
        {activeSection === 'issues' && (
          <div className="admin-section">
            <h3>Reported Issues</h3>
            <div className="issues-list">
              {reportedIssues.map(issue => (
                <div key={issue.id} className={`issue-item ${issue.status}`}>
                  <div className="issue-header">
                    <span className="issue-type">{issue.issue_type}</span>
                    <span className={`issue-status-badge ${issue.status}`}>{issue.status}</span>
                  </div>
                  {issue.description && <p className="issue-description">{issue.description}</p>}
                  <div className="issue-footer">
                    <span className="issue-date">{new Date(issue.created_at).toLocaleDateString()}</span>
                    {issue.status === 'pending' && (
                      <button onClick={() => handleResolveIssue(issue.id)} className="btn-approve">Resolve</button>
                    )}
                  </div>
                </div>
              ))}
              {reportedIssues.length === 0 && <p className="empty-text">No reported issues</p>}
            </div>
          </div>
        )}

        {/* BROADCAST */}
        {activeSection === 'broadcast' && (
          <div className="admin-section">
            <h3>Push Notification Broadcast</h3>
            <p className="broadcast-sub">Send a notification to all users with push enabled.</p>
            <textarea
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="Type your broadcast message..."
              className="broadcast-textarea"
              rows={4}
            />
            <button
              onClick={handleBroadcast}
              disabled={!broadcastMessage.trim() || broadcasting}
              className="broadcast-btn"
            >
              {broadcasting ? 'Sending...' : 'Send to All Users'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminScreen;
