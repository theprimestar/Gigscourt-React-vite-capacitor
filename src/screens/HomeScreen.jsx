import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function HomeScreen({ onStartChat, onViewProfile }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewerLat, setViewerLat] = useState(null);
  const [viewerLng, setViewerLng] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const cursorRef = useRef({ distance: null, id: null });
  const observerRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastFetchRef = useRef({ lat: null, lng: null });
  const isMounted = useRef(true);

  // Initial location
  useEffect(() => {
    isMounted.current = true;

    if (!navigator.geolocation) {
      setViewerLat(9.0765);
      setViewerLng(7.3986);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMounted.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setViewerLat(lat);
        setViewerLng(lng);
        lastFetchRef.current = { lat, lng };
      },
      () => {
        if (isMounted.current) {
          setViewerLat(9.0765);
          setViewerLng(7.3986);
        }
      }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMounted.current) return;
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const prevLat = lastFetchRef.current.lat;
        const prevLng = lastFetchRef.current.lng;

        if (prevLat && prevLng) {
          const latDiff = (newLat - prevLat) * 111320;
          const lngDiff = (newLng - prevLng) * 111320 * Math.cos((newLat * Math.PI) / 180);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

          if (distance > 100) {
            setViewerLat(newLat);
            setViewerLng(newLng);
            lastFetchRef.current = { lat: newLat, lng: newLng };
          }
        }
      },
      (err) => console.warn('Watch position error:', err.message),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    return () => {
      isMounted.current = false;
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (viewerLat === null || viewerLng === null) return;
    fetchProfiles();
  }, [viewerLat, viewerLng]);

  const enrichCards = async (profiles) => {
    if (!profiles || profiles.length === 0) return profiles;
    
    const ids = profiles.map(p => p.id);
    
    const { data: statsData } = await supabase
      .from('profiles')
      .select('id, rating, review_count, gig_count')
      .in('id', ids);

    const { data: activeData } = await supabase.rpc('get_active_status_batch', { p_user_ids: ids });
const activeMap = {};
if (activeData) {
  activeData.forEach(a => { activeMap[a.user_id] = a.is_active; });
}
// Fallback for any missing IDs
ids.forEach(id => {
  if (!(id in activeMap)) activeMap[id] = false;
});

    const statsMap = {};
    if (statsData) {
      statsData.forEach(s => {
        statsMap[s.id] = {
          rating: s.review_count > 0 ? (s.rating / s.review_count).toFixed(1) : 'New',
          gigCount: s.gig_count || 0,
        };
      });
    }

    return profiles.map(p => ({
      ...p,
      ...(statsMap[p.id] || { rating: 'New', gigCount: 0 }),
      isActive: activeMap[p.id] || false,
    }));
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_nearby_profiles', {
        viewer_lat: viewerLat,
        viewer_lng: viewerLng,
        p_limit: 20,
        p_cursor_distance: null,
        p_cursor_id: null,
      });

      if (error) {
        console.error('Failed to fetch profiles:', error);
        if (isMounted.current) setCards([]);
      } else if (isMounted.current) {
        const enriched = await enrichCards(data || []);
        if (isMounted.current) {
          setCards(enriched);
          if (data && data.length > 0) {
            const last = data[data.length - 1];
            cursorRef.current = { distance: last.distance_meters, id: last.id };
          }
          setHasMore(data && data.length === 20);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const fetchMoreProfiles = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const { data, error } = await supabase.rpc('get_nearby_profiles', {
        viewer_lat: viewerLat,
        viewer_lng: viewerLng,
        p_limit: 20,
        p_cursor_distance: cursorRef.current.distance,
        p_cursor_id: cursorRef.current.id,
      });

      if (error) {
        console.error('Failed to fetch more profiles:', error);
      } else if (isMounted.current) {
        const newCards = data || [];
        if (newCards.length > 0) {
          const enriched = await enrichCards(newCards);
          if (isMounted.current) {
            setCards((prev) => [...prev, ...enriched]);
            const last = newCards[newCards.length - 1];
            cursorRef.current = { distance: last.distance_meters, id: last.id };
          }
        }
        if (isMounted.current) setHasMore(newCards.length === 20);
      }
    } catch (err) {
      console.error('Fetch more error:', err);
    } finally {
      if (isMounted.current) setLoadingMore(false);
    }
  };

  const lastCardRef = useCallback(
    (node) => {
      if (loading || loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchMoreProfiles();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [loading, loadingMore, hasMore]
  );

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)}m away`;
    return `${(meters / 1000).toFixed(1)}km away`;
  };

  const handleCardTap = (user) => setSelectedUser(user);
  const handleCloseSheet = () => setSelectedUser(null);

  if (loading) {
    return (
      <div className="home-screen">
        <div className="home-loading">
          <div className="spinner"></div>
          <p>Finding providers near you...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <header className="home-header">
        <h1>GigsCourt</h1>
        <p>Discover local services</p>
      </header>

      {cards.length === 0 ? (
        <div className="home-empty">
          <p>No providers found nearby.</p>
          <p className="home-empty-sub">Check back soon as more people join!</p>
        </div>
      ) : (
        <div className="home-cards">
          {cards.map((user, index) => {
            const isLast = index === cards.length - 1;
            return (
              <div
                key={user.id}
                ref={isLast ? lastCardRef : null}
                className="user-card"
                onClick={() => handleCardTap(user)}
              >
                <div className="card-avatar">
                  {user.profile_pic_url ? (
                    <img src={user.profile_pic_url} alt={user.full_name} />
                  ) : (
                    <div className="card-avatar-placeholder">👤</div>
                  )}
                </div>
                <div className="card-info">
                  <h3>{user.full_name} {user.isActive && <span className="active-dot-card"></span>}</h3>
                  <p className="card-services">
                    {user.services && user.services.length > 0
                      ? user.services.slice(0, 3).map((s) => s.replace(/-/g, ' ')).join(', ')
                      : 'No services listed'}
                  </p>
                  <p className="card-distance">{formatDistance(user.distance_meters)}</p>
                  <p className="card-gigs">{user.gigCount || 0} gigs</p>
                </div>
                <div className="card-rating">
                  {user.rating !== 'New' ? (
                    <span className="rating-badge rating-badge-active">⭐ {user.rating}</span>
                  ) : (
                    <span className="rating-badge">New</span>
                  )}
                </div>
              </div>
            );
          })}
          {loadingMore && (
            <div className="home-loading-more">
              <div className="spinner"></div>
            </div>
          )}
        </div>
      )}

      {selectedUser && (
        <div className="bottom-sheet-overlay" onClick={handleCloseSheet}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <div className="bottom-sheet-content">
              <div className="sheet-avatar">
                {selectedUser.profile_pic_url ? (
                  <img src={selectedUser.profile_pic_url} alt={selectedUser.full_name} />
                ) : (
                  <div className="sheet-avatar-placeholder">👤</div>
                )}
              </div>
              <h2>{selectedUser.full_name} {selectedUser.isActive && <span className="active-dot-card"></span>}</h2>
              <p className="sheet-distance">{formatDistance(selectedUser.distance_meters)}</p>
              <p className="sheet-rating">
                {selectedUser.rating !== 'New' ? `⭐ ${selectedUser.rating} • ${selectedUser.gigCount || 0} gigs` : 'New • 0 gigs'}
              </p>
              <p className="sheet-address">{selectedUser.workspace_address || 'No address set'}</p>
              <p className="sheet-services">
                {selectedUser.services && selectedUser.services.length > 0
                  ? selectedUser.services.map((s) => s.replace(/-/g, ' ')).join(' • ')
                  : 'No services listed'}
              </p>
              <div className="sheet-buttons">
                <button className="sheet-message-btn" onClick={() => {
                  onStartChat && onStartChat(selectedUser);
                  setSelectedUser(null);
                }}>
                  💬 Message
                </button>
                <button className="sheet-view-profile-btn" onClick={() => {
                  onViewProfile && onViewProfile(selectedUser);
                  setSelectedUser(null);
                }}>
                  View Full Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
