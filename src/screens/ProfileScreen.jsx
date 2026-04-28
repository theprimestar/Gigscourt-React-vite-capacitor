import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import { getUserReviews, getRecentChats, getGigHistory } from '../gigSystem';

function ProfileScreen({ userId, isOwn, onBack, onStartChat, onEditProfile, onOpenSettings, isVisible, onRegisterGigWithPerson }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ gigs: 0, rating: 'New', gigsThisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [workPhotos, setWorkPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showFullNumber, setShowFullNumber] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showGigHistory, setShowGigHistory] = useState(false);
  const [showRecentChats, setShowRecentChats] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [gigHistory, setGigHistory] = useState([]);
  const [gigHistoryTab, setGigHistoryTab] = useState('provider');
  const [recentChats, setRecentChats] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingGigHistory, setLoadingGigHistory] = useState(false);
  const [loadingRecentChats, setLoadingRecentChats] = useState(false);

  const fileInputRef = useRef(null);
  const nameRef = useRef(null);
  const scrollRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadProfile();
    return () => { isMounted.current = false; };
  }, [userId]);

  useEffect(() => {
    if (isVisible && !loading) {
      loadProfile();
    }
  }, [isVisible]);

  const loadProfile = async () => {
    try {
      const targetId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetId || !isMounted.current) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .single();

      if (isMounted.current && profileData) {
        // Normalize show_phone: null/undefined defaults to true (visible)
        setProfile({
          ...profileData,
          show_phone: profileData.show_phone !== false,
        });
        setWorkPhotos(profileData.work_photos || []);

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: monthCount } = await supabase
          .from('gigs')
          .select('*', { count: 'exact', head: true })
          .eq('provider_id', targetId)
          .eq('status', 'completed')
          .gte('completed_at', thirtyDaysAgo);

        setStats({
          gigs: profileData.gig_count || 0,
          rating: profileData.review_count > 0 
            ? (profileData.rating / profileData.review_count).toFixed(1) 
            : 'New',
          gigsThisMonth: monthCount || 0,
        });

        const { data: activeData } = await supabase.rpc('is_user_active', { p_user_id: targetId });
        if (isMounted.current) setIsActive(activeData || false);
      }
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const loadReviews = async () => {
    const targetId = userId || profile?.id;
    if (!targetId) return;
    setLoadingReviews(true);
    try {
      const data = await getUserReviews(targetId);
      if (isMounted.current) setReviews(data);
    } catch (err) {
      console.error('Load reviews error:', err);
    } finally {
      if (isMounted.current) setLoadingReviews(false);
    }
  };

  const loadGigHistory = async (role) => {
    const targetId = userId || profile?.id;
    if (!targetId) return;
    setLoadingGigHistory(true);
    try {
      const data = await getGigHistory(targetId, role);
      if (isMounted.current) setGigHistory(data);
    } catch (err) {
      console.error('Load gig history error:', err);
    } finally {
      if (isMounted.current) setLoadingGigHistory(false);
    }
  };

  const loadRecentChatsList = async () => {
    const targetId = userId || profile?.id;
    if (!targetId) return;
    setLoadingRecentChats(true);
    try {
      const data = await getRecentChats(targetId);
      if (isMounted.current) setRecentChats(data);
    } catch (err) {
      console.error('Load recent chats error:', err);
    } finally {
      if (isMounted.current) setLoadingRecentChats(false);
    }
  };

  const handleOpenReviews = () => {
    setShowReviews(true);
    loadReviews();
  };

  const handleOpenGigHistory = () => {
    setShowGigHistory(true);
    setGigHistoryTab('provider');
    loadGigHistory('provider');
  };

  const handleSwitchGigHistoryTab = (role) => {
    setGigHistoryTab(role);
    loadGigHistory(role);
  };

  const handleOpenRecentChats = () => {
    setShowRecentChats(true);
    loadRecentChatsList();
  };

  const handleScroll = useCallback(() => {
    if (nameRef.current && scrollRef.current) {
      const rect = nameRef.current.getBoundingClientRect();
      const containerRect = scrollRef.current.getBoundingClientRect();
      setIsSticky(rect.top <= containerRect.top + 10);
    }
  }, []);

  const handleAddPhoto = () => {
    if (workPhotos.length >= 15) {
      alert('You have reached the maximum of 15 photos. Delete some to add more.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (workPhotos.length >= 15) {
      alert('Maximum 15 photos allowed. Delete some first.');
      return;
    }

    setUploadingPhoto(true);

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL);
      const auth = await authRes.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', 'work-photo.jpg');
      formData.append('folder', '/work-photos');
      formData.append('useUniqueFileName', 'true');
      formData.append('publicKey', imagekitPublicKey);
      formData.append('token', auth.token);
      formData.append('signature', auth.signature);
      formData.append('expire', auth.expire);

      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(result.message || 'Upload failed');

      const newPhotos = [...workPhotos, result.url];
      setWorkPhotos(newPhotos);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('profiles').update({ work_photos: newPhotos }).eq('id', user.id);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (index) => {
    const newPhotos = workPhotos.filter((_, i) => i !== index);
    setWorkPhotos(newPhotos);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({ work_photos: newPhotos }).eq('id', user.id);
  };

  const formatServices = (services) => {
    if (!services || services.length === 0) return '';
    return services.map((s) => s.replace(/-/g, ' ')).join(', ');
  };

  const formatJoinedDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="profile-screen">
        <div className="profile-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-screen">
        <p>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="profile-screen" ref={scrollRef} onScroll={handleScroll}>
      <div className={`profile-sticky-header ${isSticky ? 'visible' : ''}`}>
        <button onClick={onBack || (() => {})} className="profile-back-btn">
          {onBack ? '←' : '⚙️'}
        </button>
        <span className="profile-sticky-name">
          {profile.full_name}
          {isActive && <span className="active-dot" style={{ display: 'inline-block', width: 8, height: 8, background: '#34c759', borderRadius: '50%', marginLeft: 6 }}></span>}
        </span>
        <span style={{ width: 40 }} />
      </div>

      {isOwn && !isSticky && (
        <div className="profile-settings-row">
          <span />
          <button className="profile-settings-btn" onClick={onOpenSettings}>⚙️</button>
        </div>
      )}

      <div className="profile-top">
        <div className="profile-avatar">
          {profile.profile_pic_url ? (
            <img src={profile.profile_pic_url} alt={profile.full_name} />
          ) : (
            <div className="profile-avatar-placeholder">👤</div>
          )}
        </div>

        <div className="profile-stats">
          <div className="profile-stat profile-stat-tappable" onClick={handleOpenGigHistory}>
            <span className="stat-number">{stats.gigs}</span>
            <span className="stat-label">Gigs</span>
          </div>
          <div className="profile-stat profile-stat-tappable" onClick={handleOpenReviews}>
            <span className="stat-number">{stats.rating}</span>
            <span className="stat-label">Rating</span>
          </div>
        </div>
      </div>

      <div className="profile-name-section" ref={nameRef}>
        <h2 className="profile-name">
          {profile.full_name}
          {isActive && <span className="active-dot-inline" style={{ display: 'inline-block', width: 8, height: 8, background: '#34c759', borderRadius: '50%', marginLeft: 6, verticalAlign: 'middle' }}></span>}
        </h2>
      </div>

      {profile.bio && <p className="profile-bio">{profile.bio}</p>}

      <p className="profile-gigs-month">{stats.gigsThisMonth} gigs this month</p>

      {profile.workspace_address && (
        <p className="profile-address">📍 {profile.workspace_address}</p>
      )}

      {profile.services && profile.services.length > 0 && (
        <p className="profile-services-text">{formatServices(profile.services)}</p>
      )}

      {profile.created_at && (
        <p className="profile-joined">Joined {formatJoinedDate(profile.created_at)}</p>
      )}

      <div className="profile-actions">
        {isOwn ? (
          <>
            <button className="profile-action-btn primary" onClick={onEditProfile}>Edit Profile</button>
            <button className="profile-action-btn secondary" onClick={handleOpenRecentChats}>Register Gig</button>
          </>
        ) : (
          <>
            <button className="profile-action-btn primary" onClick={() => onStartChat && onStartChat(profile)}>
              💬 Message
            </button>
            <button
              className="profile-action-btn secondary"
              onClick={() => {
                if (profile.show_phone === false) {
                  alert('This user has hidden their phone number.');
                  return;
                }
                setShowFullNumber(!showFullNumber);
              }}
            >
              📞 {showFullNumber && profile.phone 
                ? profile.phone 
                : profile.show_phone === false 
                  ? 'Phone hidden' 
                  : 'Contact Now'}
            </button>
          </>
        )}
      </div>

      <div className="profile-photo-grid">
        {workPhotos.map((photo, index) => (
          <div key={index} className="photo-grid-item">
            <img src={photo} alt="" />
            {isOwn && (
              <button className="photo-delete-btn" onClick={() => handleDeletePhoto(index)}>
                ✕
              </button>
            )}
          </div>
        ))}
        {isOwn && workPhotos.length < 15 && (
          <button className="photo-grid-item photo-add-btn" onClick={handleAddPhoto}>
            {uploadingPhoto ? <div className="spinner"></div> : <span>+</span>}
          </button>
        )}
      </div>

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        style={{ display: 'none' }}
      />

      {showReviews && (
        <div className="bottom-sheet-overlay" onClick={() => setShowReviews(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <div className="bottom-sheet-content">
              <h2>Reviews</h2>
              {loadingReviews ? (
                <div className="spinner"></div>
              ) : reviews.length === 0 ? (
                <p style={{ color: '#8e8e93', marginTop: 12 }}>No reviews yet</p>
              ) : (
                reviews.map(review => (
                  <div key={review.id} className="review-item">
                    <div className="review-header">
                      <div className="review-avatar">
                        {review.reviewer_pic ? (
                          <img src={review.reviewer_pic} alt="" />
                        ) : (
                          <span>👤</span>
                        )}
                      </div>
                      <span className="review-name">{review.reviewer_name}</span>
                      <span className="review-stars">
                        {'⭐'.repeat(review.rating)}
                      </span>
                    </div>
                    {review.review_text ? (
                      <p className="review-text">{review.review_text}</p>
                    ) : null}
                    <span className="review-date">{new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showGigHistory && (
        <div className="bottom-sheet-overlay" onClick={() => setShowGigHistory(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <div className="bottom-sheet-content">
              <h2>Gig History</h2>
              <div className="gig-history-tabs">
                <button 
                  className={`gig-history-tab ${gigHistoryTab === 'provider' ? 'active' : ''}`}
                  onClick={() => handleSwitchGigHistoryTab('provider')}
                >
                  As Provider
                </button>
                <button 
                  className={`gig-history-tab ${gigHistoryTab === 'client' ? 'active' : ''}`}
                  onClick={() => handleSwitchGigHistoryTab('client')}
                >
                  As Client
                </button>
              </div>
              {loadingGigHistory ? (
                <div className="spinner"></div>
              ) : gigHistory.length === 0 ? (
                <p style={{ color: '#8e8e93', marginTop: 12 }}>No gigs found</p>
              ) : (
                gigHistory.map(gig => (
                  <div key={gig.id} className="gig-history-item">
                    <div className="gig-history-status">
                      <span className={`gig-status-badge ${gig.status}`}>
                        {gig.status === 'pending_review' ? 'Pending' : 
                         gig.status === 'completed' ? 'Completed' : 'Cancelled'}
                      </span>
                    </div>
                    {gig.rating && (
                      <span className="gig-history-rating">
                        {'⭐'.repeat(gig.rating)}
                      </span>
                    )}
                    <span className="gig-history-date">
                      {new Date(gig.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showRecentChats && (
        <div className="bottom-sheet-overlay" onClick={() => setShowRecentChats(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <div className="bottom-sheet-content">
              <h2>Register a Gig</h2>
              <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 12 }}>
                Select someone you've chatted with in the last 14 days
              </p>
              {loadingRecentChats ? (
                <div className="spinner"></div>
              ) : recentChats.length === 0 ? (
                <p style={{ color: '#8e8e93', marginTop: 12 }}>No recent chats</p>
              ) : (
                recentChats.map(chat => (
                  <div 
                    key={chat.channel_id} 
                    className="chat-list-item"
                    onClick={() => {
                      setShowRecentChats(false);
                      if (onStartChat) {
                        onStartChat({ id: chat.other_user_id, full_name: chat.other_user_name, chatId: chat.channel_id });
                      }
                    }}
                  >
                    <div className="chat-list-avatar">
                      {chat.other_user_pic ? (
                        <img src={chat.other_user_pic} alt="" />
                      ) : (
                        <div className="chat-list-avatar-placeholder">👤</div>
                      )}
                    </div>
                    <div className="chat-list-info">
                      <h3>{chat.other_user_name}</h3>
                      <p className="chat-list-preview">Last chat: {new Date(chat.last_message_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileScreen;
