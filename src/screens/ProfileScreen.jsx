import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';

function ProfileScreen({ userId, isOwn, onBack, onStartChat }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ gigs: 0, rating: 'New' });
  const [loading, setLoading] = useState(true);
  const [workPhotos, setWorkPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showFullNumber, setShowFullNumber] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const fileInputRef = useRef(null);
  const nameRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    const targetId = userId || (await supabase.auth.getUser()).data.user?.id;
    if (!targetId) return;

    // Load profile from Supabase
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single();

    if (profileData) {
      setProfile(profileData);
      setWorkPhotos(profileData.work_photos || []);
    }

    // Load stats from Firestore
    const userDocRef = doc(db, 'users', targetId);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      // Create default stats document
      await setDoc(userDocRef, {
        rating: 0,
        reviewCount: 0,
        gigCount: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    // Subscribe to stats
    onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats({
          gigs: data.gigCount || 0,
          rating: data.reviewCount > 0 ? (data.rating / data.reviewCount).toFixed(1) : 'New',
          rawRating: data.reviewCount > 0 ? data.rating : 0,
          reviewCount: data.reviewCount || 0,
        });
      }
    });

    setLoading(false);
  };

  // Sticky header on scroll
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
      const authRes = await fetch('/api/imagekit-auth');
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

      // Save to Supabase
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
      {/* Sticky Header */}
      <div className={`profile-sticky-header ${isSticky ? 'visible' : ''}`}>
        <button onClick={onBack || (() => {})} className="profile-back-btn">
          {onBack ? '←' : '⚙️'}
        </button>
        <span className="profile-sticky-name">{profile.full_name}</span>
        <span style={{ width: 40 }} />
      </div>

      {/* Settings gear (own profile only) */}
      {isOwn && !isSticky && (
        <div className="profile-settings-row">
          <span />
          <button className="profile-settings-btn">⚙️</button>
        </div>
      )}

      {/* Top Section */}
      <div className="profile-top">
        <div className="profile-avatar">
          {profile.profile_pic_url ? (
            <img src={profile.profile_pic_url} alt={profile.full_name} />
          ) : (
            <div className="profile-avatar-placeholder">👤</div>
          )}
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-number">{stats.gigs}</span>
            <span className="stat-label">Gigs</span>
          </div>
          <div className="profile-stat profile-stat-tappable">
            <span className="stat-number">{stats.rating}</span>
            <span className="stat-label">Rating</span>
          </div>
        </div>
      </div>

      {/* Name (this element is watched for sticky header) */}
      <div className="profile-name-section" ref={nameRef}>
        <h2 className="profile-name">{profile.full_name}</h2>
      </div>

      {/* Bio */}
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}

      {/* Gigs this month */}
      <p className="profile-gigs-month">{stats.gigs} gigs this month</p>

      {/* Workspace Address */}
      {profile.workspace_address && (
        <p className="profile-address">📍 {profile.workspace_address}</p>
      )}

      {/* Services */}
      {profile.services && profile.services.length > 0 && (
        <p className="profile-services-text">{formatServices(profile.services)}</p>
      )}

      {/* Action Buttons */}
      <div className="profile-actions">
        {isOwn ? (
          <>
            <button className="profile-action-btn primary">Edit Profile</button>
            <button className="profile-action-btn secondary">Register Gig</button>
          </>
        ) : (
          <>
            <button className="profile-action-btn primary" onClick={() => onStartChat && onStartChat(profile)}>
              💬 Message
            </button>
            <button
              className="profile-action-btn secondary"
              onClick={() => setShowFullNumber(!showFullNumber)}
            >
              📞 {showFullNumber && profile.phone ? profile.phone : 'Contact Now'}
            </button>
          </>
        )}
      </div>

      {/* Photo Grid */}
      <div className="profile-photo-grid">
        {workPhotos.map((photo, index) => (
          <div key={index} className="photo-grid-item">
            <img src={photo} alt="" />
            {isOwn && (
              <button
                className="photo-delete-btn"
                onClick={() => handleDeletePhoto(index)}
              >
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
    </div>
  );
}

export default ProfileScreen;
