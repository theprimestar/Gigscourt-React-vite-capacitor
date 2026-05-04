import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import { getUserReviews, getRecentChats, getGigHistory } from '../gigSystem';
import '../Profile.css';

const IconAvatar = () => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);

const IconMapPin = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
  </svg>
);

const IconStar = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

const IconBack = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconMessage = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

const IconPhone = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.897.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.913.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

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
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-stats">
            <div className="skeleton skeleton-stat" />
            <div className="skeleton skeleton-stat" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-screen">
        <p style={{ textAlign: 'center', marginTop: 60, color: 'var(--color-text-secondary)' }}>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="profile-screen" ref={scrollRef} onScroll={handleScroll}>
      <div className={`profile-sticky-header ${isSticky ? 'visible' : ''}`}>
        <button onClick={onBack || (() => {})} className="profile-back-btn">
          <IconBack />
        </button>
        <span className="profile-sticky-name">
          {profile.full_name}
          {isActive && <span className="active-dot-inline" />}
        </span>
        <span style={{ width: 40 }} />
      </div>

      {isOwn && !isSticky && (
        <div className="profile-settings-row">
          <span />
          <button className="profile-settings-btn" onClick={onOpenSettings}><IconSettings /></button>
        </div>
      )}

      <div className="profile-top">
        <div className="profile-avatar">
          {profile.profile_pic_url ? (
            <img src={profile.profile_pic_url} alt={profile.full_name} />
          ) : (
            <div className="profile-avatar-placeholder"><IconAvatar /></div>
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
          {isActive && <span className="active-dot-inline" />}
        </h2>
      </div>

      {profile.bio && <p className="profile-bio">{profile.bio}</p>}

      <p className="profile-gigs-month">{stats.gigsThisMonth} gigs this month</p>

      {profile.workspace_address && (
        <p className="profile-address"><IconMapPin /> {profile.workspace_address}</p>
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
              <IconMessage /> Message
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
              <IconPhone /> {showFullNumber && profile.phone 
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
                <IconClose />
              </button>
            )}
          </div>
        ))}
        {isOwn && workPhotos.length < 15 && (
          <button className="photo-grid-item photo-add-btn" onClick={handleAddPhoto}>
            {uploadingPhoto ? <div className="skeleton" style={{ width: '100%', height: '100%' }} /> : <span>+</span>}
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
        <div className="sheet-overlay" onClick={() => setShowReviews(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Reviews</h2>
              {loadingReviews ? (
                <div className="skeleton" style={{ width: '100%', height: 40, marginTop: 12 }} />
              ) : reviews.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', marginTop: 12 }}>No reviews yet</p>
              ) : (
                reviews.map(review => (
                  <div key={review.id} className="review-item">
                    <div className="review-header">
                      <div className="review-avatar">
                        {review.reviewer_pic ? (
                          <img src={review.reviewer_pic} alt="" />
                        ) : (
                          <IconAvatar />
                        )}
                      </div>
                      <span className="review-name">{review.reviewer_name}</span>
                      <span className="review-stars">
                        {Array.from({ length: 5 }, (_, i) => (
                          <IconStar key={i} filled={i < review.rating} />
                        ))}
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
        <div className="sheet-overlay" onClick={() => setShowGigHistory(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
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
                <div className="skeleton" style={{ width: '100%', height: 40, marginTop: 12 }} />
              ) : gigHistory.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', marginTop: 12 }}>No gigs found</p>
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
                        {Array.from({ length: 5 }, (_, i) => (
                          <IconStar key={i} filled={i < gig.rating} />
                        ))}
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
        <div className="sheet-overlay" onClick={() => setShowRecentChats(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h2>Register a Gig</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                Select someone you've chatted with in the last 14 days
              </p>
              {loadingRecentChats ? (
                <div className="skeleton" style={{ width: '100%', height: 40, marginTop: 12 }} />
              ) : recentChats.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', marginTop: 12 }}>No recent chats</p>
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
                        <div className="chat-list-avatar-placeholder"><IconAvatar /></div>
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
