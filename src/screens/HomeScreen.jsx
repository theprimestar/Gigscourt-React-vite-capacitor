import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import '../Home.css';

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);

const IconAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);

const IconMapPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

function HomeScreen({ onStartChat, onViewProfile }) {
  const [topProviders, setTopProviders] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasMoreTop, setHasMoreTop] = useState(true);
  const [loadingMoreTop, setLoadingMoreTop] = useState(false);
  const [viewerLat, setViewerLat] = useState(null);
  const [viewerLng, setViewerLng] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [discoverScrollPos, setDiscoverScrollPos] = useState(0);
  const cursorRef = useRef({ distance: null, id: null });
  const topCursorRef = useRef({ distance: null, id: null });
  const gridObserverRef = useRef(null);
  const discoverObserverRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastFetchRef = useRef({ lat: null, lng: null });
  const isMounted = useRef(true);
  const scrollContainerRef = useRef(null);
  const discoverScrollRef = useRef(null);
  const firstLoad = useRef(true);
  const isLocationChange = useRef(false);

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
        setViewerLat(pos.coords.latitude);
        setViewerLng(pos.coords.longitude);
        lastFetchRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
            isLocationChange.current = true;
            setViewerLat(newLat);
            setViewerLng(newLng);
            lastFetchRef.current = { lat: newLat, lng: newLng };
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    return () => {
      isMounted.current = false;
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (viewerLat === null || viewerLng === null) return;
    fetchTopProviders();
    fetchProfiles();
  }, [viewerLat, viewerLng]);

  const enrichCards = async (profiles) => {
    if (!profiles || profiles.length === 0) return profiles;
    const ids = profiles.map(p => p.id);
    
    const [statsData, activeData, monthCounts] = await Promise.all([
      supabase.from('profiles').select('id, rating, review_count, gig_count').in('id', ids).then(r => r.data),
      supabase.rpc('get_active_status_batch', { p_user_ids: ids }).then(r => r.data),
      supabase.from('gigs').select('provider_id', { count: 'exact' }).in('provider_id', ids).eq('status', 'completed').gte('completed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).then(r => {
        const counts = {};
        if (r.data) r.data.forEach(g => { counts[g.provider_id] = (counts[g.provider_id] || 0) + 1; });
        return counts;
      })
    ]);

    const activeMap = {};
    if (activeData) activeData.forEach(a => { activeMap[a.user_id] = a.is_active; });
    ids.forEach(id => { if (!(id in activeMap)) activeMap[id] = false; });
    
    const statsMap = {};
    if (statsData) {
      statsData.forEach(s => {
        statsMap[s.id] = {
          rating: s.review_count > 0 ? (s.rating / s.review_count).toFixed(1) : 'New',
          gigCount: s.gig_count || 0,
          gigsThisMonth: s.id in monthCounts ? monthCounts[s.id] : 0,
        };
      });
    }
    return profiles.map(p => ({
      ...p,
      ...(statsMap[p.id] || { rating: 'New', gigCount: 0, gigsThisMonth: 0 }),
      isActive: activeMap[p.id] || false,
    }));
  };

  const fetchTopProviders = async () => {
    try {
      const { data } = await supabase.rpc('get_top_nearby_providers', {
        viewer_lat: viewerLat, viewer_lng: viewerLng,
        p_limit: 10, p_cursor_distance: null, p_cursor_id: null,
      });
      if (isMounted.current && data) {
        const enriched = await enrichCards(data);
        setTopProviders(enriched);
        if (data.length > 0) {
          const last = data[data.length - 1];
          topCursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMoreTop(data && data.length === 10);
      }
    } catch (err) { console.error('Top providers error:', err); }
  };

  const fetchMoreTopProviders = async () => {
    if (loadingMoreTop || !hasMoreTop) return;
    setLoadingMoreTop(true);
    try {
      const { data } = await supabase.rpc('get_top_nearby_providers', {
        viewer_lat: viewerLat, viewer_lng: viewerLng,
        p_limit: 10,
        p_cursor_distance: topCursorRef.current.distance,
        p_cursor_id: topCursorRef.current.id,
      });
      if (isMounted.current && data) {
        const enriched = await enrichCards(data);
        setTopProviders(prev => [...prev, ...enriched]);
        if (data.length > 0) {
          const last = data[data.length - 1];
          topCursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMoreTop(data.length === 10);
      }
    } catch (err) { console.error('Fetch more top error:', err); }
    finally { if (isMounted.current) setLoadingMoreTop(false); }
  };

  const fetchProfiles = async () => {
    if (firstLoad.current) setLoading(true);
    try {
      const { data } = await supabase.rpc('get_nearby_profiles', {
        viewer_lat: viewerLat, viewer_lng: viewerLng,
        p_limit: 20, p_cursor_distance: null, p_cursor_id: null,
      });
      if (isMounted.current) {
        const enriched = await enrichCards(data || []);
        setCards(enriched);
        if (data && data.length > 0) {
          const last = data[data.length - 1];
          cursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMore(data && data.length === 20);
        if (firstLoad.current) firstLoad.current = false;
        if (isLocationChange.current) {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          isLocationChange.current = false;
        }
      }
    } catch (err) { console.error('Fetch error:', err); }
    finally { if (isMounted.current && !firstLoad.current) setLoading(false); }
  };

  const fetchMoreProfiles = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data } = await supabase.rpc('get_nearby_profiles', {
        viewer_lat: viewerLat, viewer_lng: viewerLng,
        p_limit: 20,
        p_cursor_distance: cursorRef.current.distance,
        p_cursor_id: cursorRef.current.id,
      });
      if (isMounted.current) {
        const enriched = await enrichCards(data || []);
        setCards(prev => [...prev, ...enriched]);
        if (data && data.length > 0) {
          const last = data[data.length - 1];
          cursorRef.current = { distance: last.distance_meters, id: last.id };
        }
        setHasMore(data && data.length === 20);
      }
    } catch (err) { console.error('Fetch more error:', err); }
    finally { if (isMounted.current) setLoadingMore(false); }
  };

  const lastGridCardRef = useCallback(node => {
    if (loading || loadingMore) return;
    if (gridObserverRef.current) gridObserverRef.current.disconnect();
    gridObserverRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) fetchMoreProfiles();
    });
    if (node) gridObserverRef.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const lastDiscoverCardRef = useCallback(node => {
    if (loading || loadingMoreTop) return;
    if (discoverObserverRef.current) discoverObserverRef.current.disconnect();
    discoverObserverRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreTop) fetchMoreTopProviders();
    });
    if (node) discoverObserverRef.current.observe(node);
  }, [loading, loadingMoreTop, hasMoreTop]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop;
      setScrolled(scrollTop > 20);
      setShowScrollTop(scrollTop > 500);
    }
  };

  const handleDiscoverScroll = () => {
    if (discoverScrollRef.current) {
      const scrollLeft = discoverScrollRef.current.scrollLeft;
      const cardWidth = 264;
      setDiscoverScrollPos(Math.round(scrollLeft / cardWidth));
    }
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)}m away`;
    return `${(meters / 1000).toFixed(1)}km away`;
  };

  const formatJoined = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const renderStars = (rating) => {
  if (rating === 'New' || !rating) return null;
  const num = parseFloat(rating);
  const rounded = Math.round(num);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
};

  const handleCardTap = (user) => setSelectedUser(user);

  const renderProviderCard = (user, isDiscover = false) => (
    <div
      key={user.id}
      className={isDiscover ? 'discover-card' : 'provider-card'}
      onClick={() => handleCardTap(user)}
    >
      {user.profile_pic_url ? (
        <img src={user.profile_pic_url} alt={user.full_name} />
      ) : (
        <div className="card-avatar-placeholder"><IconAvatar /></div>
      )}
      <div className={isDiscover ? 'discover-card-overlay' : 'provider-card-overlay'}>
        <div className={isDiscover ? 'discover-card-name' : 'provider-card-name'}>
          {user.isActive && <span className="active-dot-card" />}
          {user.full_name}
        </div>
        {isDiscover ? (
          <div className="discover-card-meta">
            <span>{user.rating !== 'New' ? `★ ${user.rating}` : 'New'}</span>
            <span>{user.gigsThisMonth || 0} gigs this month</span>
            <span>{formatDistance(user.distance_meters)}</span>
          </div>
        ) : (
          <>
            <div className="provider-card-distance">{formatDistance(user.distance_meters)}</div>
            <div className="provider-card-services">
              {user.services?.slice(0, 2).map(s => s.replace(/-/g, ' ')).join(', ') || 'No services'}
            </div>
            <div className="provider-card-rating">
              {user.rating !== 'New' ? `★ ${user.rating} · ${user.gigsThisMonth || 0} gigs` : 'New'}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="home-screen" ref={scrollContainerRef} onScroll={handleScroll}>
      <header className={`home-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="header-top-row">
          <div className="header-brand">
            <div className="header-logo">
              <div className="header-logo-circle header-logo-circle-left" />
              <div className="header-logo-circle header-logo-circle-right" />
            </div>
            <span className="header-title">GigsCourt</span>
          </div>
          <button className="header-notif-btn"><IconBell /></button>
        </div>
      </header>

      {loading && firstLoad.current ? (
        <>
          <div className="home-section">
            <div className="section-title">Top Providers Near You</div>
            <div className="section-desc">Active and trusted providers close to you</div>
            <div className="discover-scroll">
              {[1, 2, 3].map(i => <div key={i} className="skeleton-discover-card" />)}
            </div>
          </div>
          <div className="home-section">
            <div className="section-title">All Providers</div>
            <div className="section-desc">Discover all available providers in your area</div>
            <div className="providers-grid">
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton-grid-card" />)}
            </div>
          </div>
        </>
      ) : cards.length === 0 && topProviders.length === 0 ? (
        <div className="home-empty">
          <div className="home-empty-logo">
            <div className="empty-circle empty-circle-left" />
            <div className="empty-circle empty-circle-right" />
          </div>
          <h3>No providers nearby yet</h3>
          <p>You can be the first to offer your service in this area</p>
        </div>
      ) : (
        <>
          {topProviders.length > 0 && (
            <div className="home-section">
              <div className="section-title">Top Providers Near You</div>
              <div className="section-desc">Active and trusted providers close to you</div>
              <div className="discover-scroll" ref={discoverScrollRef} onScroll={handleDiscoverScroll}>
                {topProviders.map((user, i) => {
                  const isLast = i === topProviders.length - 1;
                  return (
                    <div key={user.id} ref={isLast ? lastDiscoverCardRef : null}>
                      {renderProviderCard(user, true)}
                    </div>
                  );
                })}
                {loadingMoreTop && <div className="skeleton-discover-card" />}
              </div>
              {topProviders.length > 1 && (
                <div className="discover-dots">
                  {topProviders.map((_, i) => (
                    <div key={i} className={`discover-dot ${i === discoverScrollPos ? 'active' : ''}`} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="home-section">
            <div className="section-title">All Providers</div>
            <div className="section-desc">Discover all available providers in your area</div>
            <div className="providers-grid">
              {cards.map((user, i) => {
                const isLast = i === cards.length - 1;
                return (
                  <div key={user.id} ref={isLast ? lastGridCardRef : null}>
                    {renderProviderCard(user)}
                  </div>
                );
              })}
            </div>
            {loadingMore && (
              <div className="home-loading-more"><div className="load-more-spinner" /></div>
            )}
          </div>
        </>
      )}

      {selectedUser && ReactDOM.createPortal(
        <div className="bottom-sheet-overlay" onClick={() => setSelectedUser(null)}>
          <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-content">
              <div className="sheet-avatar">
                <div className={`sheet-avatar-ring ${selectedUser.isActive ? 'active' : ''}`} />
                {selectedUser.profile_pic_url ? (
                  <img src={selectedUser.profile_pic_url} alt={selectedUser.full_name} />
                ) : (
                  <div className="sheet-avatar-placeholder"><IconAvatar /></div>
                )}
              </div>
              <h2>
                {selectedUser.full_name}
                {selectedUser.isActive && <span className="active-dot-card" />}
              </h2>

              {selectedUser.rating !== 'New' ? (
                <>
                  <div className="sheet-stars">{renderStars(selectedUser.rating)}</div>
                  <div className="sheet-rating-count">
                    {selectedUser.rating} · {selectedUser.review_count || 0} review{selectedUser.review_count !== 1 ? 's' : ''}
                  </div>
                </>
              ) : (
                <div className="sheet-no-rating">No ratings yet</div>
              )}

              <div className="sheet-stats-row">
                <div className="sheet-stat">
                  <div className="sheet-stat-value">{selectedUser.gigsThisMonth || 0}</div>
                  <div className="sheet-stat-label">This Month</div>
                </div>
                <div className="sheet-stat">
                  <div className="sheet-stat-value">{selectedUser.gigCount || 0}</div>
                  <div className="sheet-stat-label">Total Gigs</div>
                </div>
                <div className="sheet-stat">
                  <div className="sheet-stat-value">{formatJoined(selectedUser.created_at)}</div>
                  <div className="sheet-stat-label">Joined</div>
                </div>
              </div>

              <div className="sheet-distance-badge">{formatDistance(selectedUser.distance_meters)}</div>

              {selectedUser.workspace_address && (
                <div className="sheet-address">
                  <IconMapPin />
                  {selectedUser.workspace_address}
                </div>
              )}

              {selectedUser.services?.length > 0 && (
                <div className="sheet-services-chips">
                  {selectedUser.services.map(s => (
                    <span key={s} className="sheet-service-chip">{s.replace(/-/g, ' ')}</span>
                  ))}
                </div>
              )}

              <div className="sheet-buttons">
                <button className="sheet-message-btn" onClick={() => { onStartChat?.(selectedUser); setSelectedUser(null); }}>Message</button>
                <button className="sheet-view-profile-btn" onClick={() => { onViewProfile?.(selectedUser); setSelectedUser(null); }}>View Profile</button>
              </div>
            </div>
          </div>
        </div>,
        document.getElementById('portal-root')
      )}

      {showScrollTop && (
        <button className="scroll-to-top" onClick={scrollToTop}><IconArrowUp /></button>
      )}
    </div>
  );
}

export default HomeScreen;
