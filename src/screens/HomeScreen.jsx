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

    // Watch position for significant changes (100 meters)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMounted.current) return;
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const prevLat = lastFetchRef.current.lat;
        const prevLng = lastFetchRef.current.lng;

        // Calculate distance moved in meters (approximate)
        if (prevLat && prevLng) {
          const latDiff = (newLat - prevLat) * 111320;
          const lngDiff = (newLng - prevLng) * 111320 * Math.cos((newLat * Math.PI) / 180);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

          // Only refetch if moved more than 100 meters
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

  // Fetch profiles when location changes
  useEffect(() => {
    if (viewerLat === null || viewerLng === null) return;
    fetchProfiles();
  }, [viewerLat, viewerLng]);

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
        setCards(data || []);
        if (data && data.length > 0) {
          const last = data[data.length - 1];
          cursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMore(data && data.length === 20);
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
          setCards((prev) => [...prev, ...newCards]);
          const last = newCards[newCards.length - 1];
          cursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMore(newCards.length === 20);
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
                  <h3>{user.full_name}</h3>
                  <p className="card-services">
                    {user.services && user.services.length > 0
                      ? user.services.slice(0, 3).map((s) => s.replace(/-/g, ' ')).join(', ')
                      : 'No services listed'}
                  </p>
                  <p className="card-distance">{formatDistance(user.distance_meters)}</p>
                </div>
                <div className="card-rating">
                  <span className="rating-badge">New</span>
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
              <h2>{selectedUser.full_name}</h2>
              <p className="sheet-distance">{formatDistance(selectedUser.distance_meters)}</p>
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
