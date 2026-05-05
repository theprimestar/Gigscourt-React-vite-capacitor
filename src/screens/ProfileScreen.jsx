import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import { getUserReviews, getRecentChats, getGigHistory } from '../gigSystem';
import '../Profile.css';

const CACHE_KEY_OWN_PROFILE = 'gigscourt_own_profile';
const CACHE_KEY_PROFILE_PREFIX = 'gigscourt_profile_';
const CACHE_KEY_REVIEWS_PREFIX = 'gigscourt_reviews_';
const CACHE_KEY_GIG_HISTORY_PREFIX = 'gigscourt_gighistory_';

const CREDIT_PACKAGES = [
  { credits: 3, amount: 150000, label: '3 Credits', price: '₦1,500' },
  { credits: 5, amount: 225000, label: '5 Credits', price: '₦2,250' },
  { credits: 8, amount: 340000, label: '8 Credits', price: '₦3,400' },
  { credits: 10, amount: 400000, label: '10 Credits', price: '₦4,000' },
];

function getCached(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function setCached(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getPhotoUrl(url, size) {
  if (!url) return '';
  const base = url.split('?')[0];
  if (size === 'thumb') return base + '?tr=f-webp,fo-auto,w-300,q-75';
  if (size === 'gallery') return base + '?tr=f-webp,fo-auto,w-1200,q-85';
  return base;
}

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

const IconStar = ({ filled, width = 12, height = 12 }) => (
  <svg viewBox="0 0 24 24" width={width} height={height} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconCloseLarge = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconHamburger = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
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

const IconGallery = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const IconTrash = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
);

const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);

const IconCoin = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M14.5 9.5c0-1.5-1-2.5-2.5-2.5s-2.5 1-2.5 2.5 1 2.5 2.5 2.5 2.5 1 2.5 2.5-1 2.5-2.5 2.5-2.5-1-2.5-2.5"/>
    <line x1="12" y1="6" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="22"/>
  </svg>
);

function ProfileScreen({ userId, isOwn, onBack, onStartChat, onEditProfile, onOpenSettings, isVisible, onRegisterGigWithPerson }) {
  const targetId = userId;
  const profileCacheKey = isOwn ? CACHE_KEY_OWN_PROFILE : CACHE_KEY_PROFILE_PREFIX + targetId;
  const reviewsCacheKey = CACHE_KEY_REVIEWS_PREFIX + (targetId || 'own');
  const gigHistoryCacheKey = CACHE_KEY_GIG_HISTORY_PREFIX + (targetId || 'own');

  const cachedProfile = getCached(profileCacheKey);

  const [profile, setProfile] = useState(cachedProfile || null);
  const [stats, setStats] = useState(cachedProfile ? {
    gigs: cachedProfile.gig_count || 0,
    rating: cachedProfile.review_count > 0 ? (cachedProfile.rating / cachedProfile.review_count).toFixed(1) : 'New',
    gigsThisMonth: 0,
  } : { gigs: 0, rating: 'New', gigsThisMonth: 0 });
  const [loading, setLoading] = useState(!cachedProfile);
  const [credits, setCredits] = useState(0);
  const [workPhotos, setWorkPhotos] = useState(() => {
    const photos = cachedProfile?.work_photos || [];
    return [...photos].reverse();
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showFullNumber, setShowFullNumber] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showGigHistory, setShowGigHistory] = useState(false);
  const [showRecentChats, setShowRecentChats] = useState(false);
  const [showCreditPackages, setShowCreditPackages] = useState(false);
  const [reviews, setReviews] = useState(() => getCached(reviewsCacheKey) || []);
  const [gigHistory, setGigHistory] = useState(() => getCached(gigHistoryCacheKey + '_provider') || []);
  const [gigHistoryTab, setGigHistoryTab] = useState('provider');
  const [recentChats, setRecentChats] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingGigHistory, setLoadingGigHistory] = useState(false);
  const [loadingRecentChats, setLoadingRecentChats] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [paying, setPaying] = useState(false);

  const fileInputRef = useRef(null);
  const nameRef = useRef(null);
  const scrollRef = useRef(null);
  const isMounted = useRef(true);
  const initialFetchDone = useRef(!!cachedProfile);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible) {
      loadProfile();
      if (isOwn) loadCredits();
    } else {
      initialFetchDone.current = false;
    }
    return () => { isMounted.current = false; };
  }, [targetId, isVisible]);

  const loadCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      const { getCredits } = await import('../gigSystem');
      const balance = await getCredits(user.id);
      if (isMounted.current) setCredits(balance);
    } catch (err) {
      console.error('Failed to load credits:', err);
    }
  };

  const loadProfile = async () => {
    try {
      const id = targetId || (await supabase.auth.getUser()).data.user?.id;
      if (!id || !isMounted.current) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (isMounted.current && profileData) {
        setProfile({
          ...profileData,
          show_phone: profileData.show_phone !== false,
        });
        setWorkPhotos([...(profileData.work_photos || [])].reverse());

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: monthCount } = await supabase
          .from('gigs')
          .select('*', { count: 'exact', head: true })
          .eq('provider_id', id)
          .eq('status', 'completed')
          .gte('completed_at', thirtyDaysAgo);

        setStats({
          gigs: profileData.gig_count || 0,
          rating: profileData.review_count > 0 
            ? (profileData.rating / profileData.review_count).toFixed(1) 
            : 'New',
          gigsThisMonth: monthCount || 0,
        });

        const { data: activeData } = await supabase.rpc('is_user_active', { p_user_id: id });
        if (isMounted.current) setIsActive(activeData || false);

        const currentCacheKey = isOwn ? CACHE_KEY_OWN_PROFILE : CACHE_KEY_PROFILE_PREFIX + id;
        setCached(currentCacheKey, profileData);
        initialFetchDone.current = true;
      }
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const loadReviews = async () => {
    const id = targetId || profile?.id;
    if (!id) return;
    const key = CACHE_KEY_REVIEWS_PREFIX + id;
    const cached = getCached(key);
    if (cached) setReviews(cached);
    setLoadingReviews(true);
    try {
      const data = await getUserReviews(id);
      if (isMounted.current) {
        setReviews(data);
        setCached(key, data);
      }
    } catch (err) {
      console.error('Load reviews error:', err);
    } finally {
      if (isMounted.current) setLoadingReviews(false);
    }
  };

  const loadGigHistory = async (role) => {
    const id = targetId || profile?.id;
    if (!id) return;
    const key = CACHE_KEY_GIG_HISTORY_PREFIX + id + '_' + role;
    const cached = getCached(key);
    if (cached) setGigHistory(cached);
    setLoadingGigHistory(true);
    try {
      const data = await getGigHistory(id, role);
      if (isMounted.current) {
        setGigHistory(data);
        setCached(key, data);
      }
    } catch (err) {
      console.error('Load gig history error:', err);
    } finally {
      if (isMounted.current) setLoadingGigHistory(false);
    }
  };

  const loadRecentChatsList = async () => {
    const id = targetId || profile?.id;
    if (!id) return;
    setLoadingRecentChats(true);
    try {
      const data = await getRecentChats(id);
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

  const handleAddPhotos = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = 15 - workPhotos.length;
    if (remaining <= 0) {
      alert('Maximum 15 photos allowed. Delete some first.');
      return;
    }

    const filesToUpload = files.slice(0, remaining);
    setUploadingPhoto(true);

    for (const file of filesToUpload) {
      if (!isMounted.current) break;
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

        const newUrl = result.url;
        
        setWorkPhotos(prev => {
          const updated = [newUrl, ...prev];
          const reversed = [...updated].reverse();
          
          supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
              supabase.from('profiles').update({ work_photos: reversed }).eq('id', data.user.id);
              setCached(CACHE_KEY_OWN_PROFILE, { ...profile, work_photos: reversed });
            }
          });
          
          return updated;
        });
      } catch (err) {
        console.error('Photo upload failed:', err);
      }
    }

    if (isMounted.current) setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePhoto = async () => {
    if (!confirm('Delete this photo?')) return;

    const newPhotos = workPhotos.filter((_, i) => i !== galleryIndex);
    setWorkPhotos(newPhotos);

    const reversed = [...newPhotos].reverse();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ work_photos: reversed }).eq('id', user.id);
      setCached(CACHE_KEY_OWN_PROFILE, { ...profile, work_photos: reversed });
    }

    if (newPhotos.length === 0) {
      setGalleryOpen(false);
      setGalleryIndex(0);
    } else if (galleryIndex >= newPhotos.length) {
      setGalleryIndex(newPhotos.length - 1);
    }
  };

  const handleGridDeletePhoto = async (e, index) => {
    e.stopPropagation();
    if (!confirm('Delete this photo?')) return;

    const newPhotos = workPhotos.filter((_, i) => i !== index);
    setWorkPhotos(newPhotos);

    const reversed = [...newPhotos].reverse();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ work_photos: reversed }).eq('id', user.id);
      setCached(CACHE_KEY_OWN_PROFILE, { ...profile, work_photos: reversed });
    }
  };

  const openGallery = (index) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const navigateGallery = (direction) => {
    setGalleryIndex(prev => {
      const next = prev + direction;
      if (next < 0) return workPhotos.length - 1;
      if (next >= workPhotos.length) return 0;
      return next;
    });
  };

  const handleBuyCredits = (pkg) => {
    setShowCreditPackages(false);
    setPaying(true);

    supabase.auth.getUser().then(({ data }) => {
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
            const { getCredits } = await import('../gigSystem');
            const balance = await getCredits(data.user.id);
            if (isMounted.current) setCredits(balance);
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

      {!isOwn && !isSticky && (
        <div className="profile-settings-row">
          <button onClick={onBack} className="profile-back-btn"><IconBack /></button>
          <span />
        </div>
      )}

      {isOwn && !isSticky && (
        <div className="profile-settings-row">
          <span />
          <button className="profile-settings-btn" onClick={onOpenSettings}><IconHamburger /></button>
        </div>
      )}

      <div className="profile-top">
        <div className="profile-avatar">
          {profile.profile_pic_url ? (
            <img src={getPhotoUrl(profile.profile_pic_url, 'thumb')} alt={profile.full_name} />
          ) : (
            <div className="profile-avatar-placeholder"><IconAvatar /></div>
          )}
        </div>

        <div className="profile-stats">
          <div className="profile-stat profile-stat-tappable" onClick={handleOpenGigHistory}>
            <span className="stat-number">{stats.gigs}</span>
            <span className="stat-label"><IconBriefcase /> Gigs</span>
          </div>
          <div className="profile-stat profile-stat-tappable" onClick={handleOpenReviews}>
            <span className="stat-number">{stats.rating}</span>
            <span className="stat-label"><IconStar width={14} height={14} /> Rating</span>
          </div>
          {isOwn && (
            <div className="profile-stat profile-stat-tappable" onClick={() => setShowCreditPackages(true)}>
              <span className="stat-number">{credits}</span>
              <span className="stat-label"><IconCoin /> Credits</span>
            </div>
          )}
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

      {isOwn && (
        <div className="add-photos-row">
          <button
            onClick={handleAddPhotos}
            disabled={uploadingPhoto}
            className="chip add-photos-chip"
          >
            {uploadingPhoto ? 'Uploading...' : 'Add Photos +'}
          </button>
        </div>
      )}

      {isOwn && workPhotos.length === 0 && (
        <div className="photos-empty-state">
          <IconGallery />
          <p className="photos-empty-title">Showcase your work</p>
          <p className="photos-empty-sub">
            Add photos of your best work to attract more clients. Tap 'Add Photos +' above to get started.
          </p>
        </div>
      )}

      {workPhotos.length > 0 && (
        <div className="profile-photo-grid">
          {workPhotos.map((photo, index) => (
            <div key={index} className="photo-grid-item" onClick={() => openGallery(index)}>
              <img src={getPhotoUrl(photo, 'thumb')} alt="" loading="lazy" />
              {isOwn && (
                <button
                  className="photo-delete-btn"
                  onClick={(e) => handleGridDeletePhoto(e, index)}
                >
                  <IconClose />
                </button>
              )}
            </div>
          ))}
          {isOwn && workPhotos.length < 15 && (
            <button className="photo-grid-item photo-add-btn" onClick={handleAddPhotos}>
              <span>+</span>
            </button>
          )}
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        style={{ display: 'none' }}
      />

      {galleryOpen && (
        <div className="gallery-overlay" onClick={() => setGalleryOpen(false)}>
          <button
            className="gallery-close-btn"
            onClick={() => setGalleryOpen(false)}
          >
            <IconCloseLarge />
          </button>

          {isOwn && (
            <button
              className="gallery-delete-btn"
              onClick={handleDeletePhoto}
            >
              <IconTrash />
            </button>
          )}

          {workPhotos.length > 1 && (
            <>
              <button
                className="gallery-nav-btn gallery-nav-left"
                onClick={(e) => { e.stopPropagation(); navigateGallery(-1); }}
              >
                <IconChevronLeft />
              </button>
              <button
                className="gallery-nav-btn gallery-nav-right"
                onClick={(e) => { e.stopPropagation(); navigateGallery(1); }}
              >
                <IconChevronRight />
              </button>
            </>
          )}

          <img
            src={getPhotoUrl(workPhotos[galleryIndex], 'gallery')}
            alt=""
            className="gallery-image"
            onClick={(e) => e.stopPropagation()}
          />

          {workPhotos.length > 1 && (
            <div className="gallery-counter">
              {galleryIndex + 1} / {workPhotos.length}
            </div>
          )}
        </div>
      )}

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
                          <img src={getPhotoUrl(review.reviewer_pic, 'thumb')} alt="" />
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
                        <img src={getPhotoUrl(chat.other_user_pic, 'thumb')} alt="" />
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

      {showCreditPackages && (
        <div className="sheet-overlay" onClick={() => setShowCreditPackages(false)}>
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

export default ProfileScreen;
