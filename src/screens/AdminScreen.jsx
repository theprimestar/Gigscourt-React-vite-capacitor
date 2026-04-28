import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
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
  const [services, setServices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [topProviders, setTopProviders] = useState([]);
  const [reportedIssues, setReportedIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [editingService, setEditingService] = useState(null);
  const [editName, setEditName] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  
  // User search
  const [userQuery, setUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [giftUserId, setGiftUserId] = useState(null);
  const [giftAmount, setGiftAmount] = useState('');
  
  // New service
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('');
  const [addingService, setAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceCategory, setEditServiceCategory] = useState('');

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
      loadServices(),
      loadPurchases(),
      loadTopProviders(),
      loadReportedIssues(),
    ]);
    if (isMounted.current) setLoading(false);
  };

  const loadStats = async () => {
    try {
      const { data } = await supabase.rpc('get_admin_stats');
      if (isMounted.current && data) {
        setStats({
          totalUsers: data.total_users || 0,
          activeToday: data.active_today || 0,
          totalGigs: data.total_gigs || 0,
          completedGigs: data.completed_gigs || 0,
          pendingGigs: data.pending_gigs || 0,
          cancelledGigs: data.cancelled_gigs || 0,
          totalRevenue: data.total_revenue || 0,
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

  const loadServices = async () => {
    const { data } = await supabase
      .from('services')
      .select('*')
      .order('category')
      .order('name');
    if (isMounted.current && data) setServices(data);
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

  // User search
  const handleSearchUsers = async () => {
    if (!userQuery.trim()) return;
    setSearching(true);
    const { data } = await supabase.rpc('search_users', { p_query: userQuery.trim() });
    if (isMounted.current) setSearchResults(data || []);
    setSearching(false);
  };

  const handleGiftCredits = async () => {
    if (!giftUserId || !giftAmount || parseInt(giftAmount) < 1) return;
    const { data } = await supabase.rpc('gift_credits', {
      p_user_id: giftUserId,
      p_amount: parseInt(giftAmount),
    });
    if (data?.success) {
      alert(`Gifted ${giftAmount} credits successfully!`);
      setGiftUserId(null);
      setGiftAmount('');
      loadStats();
    }
  };

  // Service requests
  const handleApproveService = async (id) => {
    await supabase.from('service_requests').update({ status: 'approved' }).eq('id', id);
    loadServiceRequests();
  };

  const handleRejectService = async (id) => {
    await supabase.from('service_requests').update({ status: 'rejected' }).eq('id', id);
    loadServiceRequests();
  };

  const handleEditRequest = async (id) => {
    if (!editName.trim()) return;
    await supabase.from('service_requests').update({ requested_name: editName.trim(), status: 'approved' }).eq('id', id);
    setEditingService(null);
    setEditName('');
    loadServiceRequests();
  };

  // Services catalog
  const handleAddService = async () => {
    if (!newServiceName.trim() || !newServiceCategory.trim()) return;
    const slug = newServiceName.trim().toLowerCase().replace(/\s+/g, '-');
    await supabase.from('services').insert({
      name: newServiceName.trim(),
      slug,
      category: newServiceCategory.trim(),
      is_active: true,
    });
    setNewServiceName('');
    setNewServiceCategory('');
    setAddingService(false);
    loadServices();
  };

  const handleToggleService = async (id, currentStatus) => {
    await supabase.from('services').update({ is_active: !currentStatus }).eq('id', id);
    loadServices();
  };

  const handleDeleteService = async (id) => {
    if (!confirm('Delete this service?')) return;
    await supabase.from('services').delete().eq('id', id);
    loadServices();
  };

  const handleEditServiceCatalog = async (id) => {
    if (!editServiceName.trim()) return;
    const slug = editServiceName.trim().toLowerCase().replace(/\s+/g, '-');
    await supabase.from('services').update({
      name: editServiceName.trim(),
      slug,
      category: editServiceCategory.trim(),
    }).eq('id', id);
    setEditingServiceId(null);
    loadServices();
  };

  // Issues
  const handleResolveIssue = async (id) => {
    await supabase.from('reported_issues').update({ status: 'resolved' }).eq('id', id);
    loadReportedIssues();
  };

  // Broadcast
  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setBroadcasting(true);
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

      <div className="admin-tabs">
        {['dashboard', 'users', 'services', 'purchases', 'providers', 'issues', 'broadcast'].map(section => (
          <button
            key={section}
            className={`admin-tab ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
          >
            {section === 'dashboard' ? '📊 Overview' :
             section === 'users' ? '👥 Users' :
             section === 'services' ? '📝 Services' :
             section === 'purchases' ? '💳 Revenue' :
             section === 'providers' ? '⭐ Providers' :
             section === 'issues' ? '🚩 Issues' : '📢 Broadcast'}
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

        {/* USERS */}
        {activeSection === 'users' && (
          <div className="admin-section">
            <h3>User Search</h3>
            <div className="user-search-bar">
              <input
                type="text"
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="user-search-input"
                onKeyDown={e => e.key === 'Enter' && handleSearchUsers()}
              />
              <button onClick={handleSearchUsers} disabled={searching} className="user-search-btn">
                {searching ? '...' : 'Search'}
              </button>
            </div>
            <div className="search-results">
              {searchResults.map(user => (
                <div key={user.id} className="user-result-item">
                  <div className="user-result-info">
                    <span className="user-result-name">{user.full_name}</span>
                    <span className="user-result-email">{user.email}</span>
                    <span className="user-result-stats">{user.gig_count} gigs • {user.credits} credits</span>
                  </div>
                  <button
                    className="btn-gift"
                    onClick={() => setGiftUserId(giftUserId === user.id ? null : user.id)}
                  >
                    🎁 Gift
                  </button>
                  {giftUserId === user.id && (
                    <div className="gift-credits-row">
                      <input
                        type="number"
                        value={giftAmount}
                        onChange={e => setGiftAmount(e.target.value)}
                        placeholder="Credits"
                        className="gift-input"
                        min="1"
                      />
                      <button onClick={handleGiftCredits} className="btn-approve">Send</button>
                    </div>
                  )}
                </div>
              ))}
              {searchResults.length === 0 && userQuery && !searching && (
                <p className="empty-text">No users found</p>
              )}
            </div>
          </div>
        )}

        {/* SERVICES */}
        {activeSection === 'services' && (
          <>
            {/* Service Catalog */}
            <div className="admin-section">
              <div className="admin-section-header">
                <h3>Service Catalog</h3>
                <button className="btn-approve" onClick={() => setAddingService(!addingService)}>
                  {addingService ? 'Cancel' : '+ Add'}
                </button>
              </div>
              {addingService && (
                <div className="add-service-form">
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={e => setNewServiceName(e.target.value)}
                    placeholder="Service name"
                    className="service-edit-input"
                  />
                  <input
                    type="text"
                    value={newServiceCategory}
                    onChange={e => setNewServiceCategory(e.target.value)}
                    placeholder="Category"
                    className="service-edit-input"
                  />
                  <button onClick={handleAddService} className="btn-approve">Save</button>
                </div>
              )}
              <div className="service-list">
                {services.map(s => (
                  <div key={s.id} className={`service-item ${s.is_active ? '' : 'inactive'}`}>
                    {editingServiceId === s.id ? (
                      <div className="service-info" style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={editServiceName}
                          onChange={e => setEditServiceName(e.target.value)}
                          className="service-edit-input"
                        />
                        <input
                          type="text"
                          value={editServiceCategory}
                          onChange={e => setEditServiceCategory(e.target.value)}
                          className="service-edit-input"
                        />
                      </div>
                    ) : (
                      <div className="service-info">
                        <span className="service-name">{s.name}</span>
                        <span className="service-category-label">{s.category}</span>
                        {!s.is_active && <span className="service-status-badge rejected">Inactive</span>}
                      </div>
                    )}
                    <div className="service-actions">
                      {editingServiceId === s.id ? (
                        <>
                          <button onClick={() => handleEditServiceCatalog(s.id)} className="btn-approve">Save</button>
                          <button onClick={() => setEditingServiceId(null)} className="btn-reject">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingServiceId(s.id); setEditServiceName(s.name); setEditServiceCategory(s.category); }}
                            className="btn-edit"
                          >
                            Edit
                          </button>
                          <button onClick={() => handleToggleService(s.id, s.is_active)} className="btn-edit">
                            {s.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => handleDeleteService(s.id)} className="btn-reject">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* User Service Requests */}
            <div className="admin-section">
              <h3>User Service Requests</h3>
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
                          <button onClick={() => handleEditRequest(sr.id)} className="btn-approve">Save</button>
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
                {serviceRequests.length === 0 && <p className="empty-text">No requests</p>}
              </div>
            </div>
          </>
        )}

        {/* PURCHASES */}
        {activeSection === 'purchases' && (
          <div className="admin-section">
            <h3>Credit Purchases</h3>
            <div className="purchases-list">
              {purchases.map(p => (
                <div key={p.id} className="purchase-item">
                  <div className="purchase-info">
                    <span className="purchase-amount">{p.paystack_reference?.startsWith('admin_gift') ? '🎁 Gift' : formatNaira(p.amount_paid)}</span>
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

        {/* PROVIDERS */}
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

        {/* ISSUES */}
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
