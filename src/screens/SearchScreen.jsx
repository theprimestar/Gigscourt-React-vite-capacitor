import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet-rotate';
import '../Search.css';

const POPULAR_SERVICES = [
  'barbing', 'tailoring', 'makeup', 'hairdressing',
  'electrical', 'plumbing', 'auto-mechanic', 'photography'
];

const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconMap = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6v16l7-5 8 5 7-5V2l-7 5-8-5-7 5z"/><path d="M8 2v16"/><path d="M16 6v16"/>
  </svg>
);

const IconList = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
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

const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);

function SearchScreen({ onStartChat, onViewProfile }) {
  const [view, setView] = useState('map');
  const [searchTerm, setSearchTerm] = useState('');
  const [radius, setRadius] = useState(1000);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewerLat, setViewerLat] = useState(null);
  const [viewerLng, setViewerLng] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeService, setActiveService] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [services, setServices] = useState([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showChipsSlider, setShowChipsSlider] = useState(true);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const viewerMarker = useRef(null);
  const debounceRef = useRef(null);
  const listScrollRef = useRef(null);
  const prevScrollY = useRef(0);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setViewerLat(pos.coords.latitude); setViewerLng(pos.coords.longitude); },
        () => { setViewerLat(9.0765); setViewerLng(7.3986); }
      );
    } else {
      setViewerLat(9.0765); setViewerLng(7.3986);
    }
  }, []);

  useEffect(() => {
    supabase.rpc('get_services').then(({ data }) => { if (data) setServices(data); });
  }, []);

  useEffect(() => {
    if (viewerLat === null || viewerLng === null || !mapContainer.current || map.current) return;
    setTimeout(() => {
      if (!mapContainer.current) return;
      map.current = L.map(mapContainer.current, {
        center: [viewerLat, viewerLng], zoom: 14, zoomControl: false, attributionControl: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 20,
      }).addTo(map.current);
      const vIcon = L.divIcon({
        html: '<div style="width:14px;height:14px;background:#007aff;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,122,255,0.4);"></div>',
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      });
      viewerMarker.current = L.marker([viewerLat, viewerLng], { icon: vIcon }).addTo(map.current);
      map.current.invalidateSize();
    }, 300);
  }, [viewerLat, viewerLng]);

  useEffect(() => {
    if (map.current) {
      map.current.setView([viewerLat, viewerLng], map.current.getZoom());
      if (viewerMarker.current) viewerMarker.current.setLatLng([viewerLat, viewerLng]);
    }
  }, [viewerLat, viewerLng]);

  // Map resize observer — fires when container gets real dimensions
  useEffect(() => {
    if (!mapContainer.current || !map.current) return;
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    
    resizeObserverRef.current = new ResizeObserver(() => {
      if (map.current && view === 'map') {
        map.current.invalidateSize();
      }
    });
    resizeObserverRef.current.observe(mapContainer.current);
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [view, map.current]);

  // Also invalidate when view changes to map
  useEffect(() => {
    if (view === 'map' && map.current) {
      setTimeout(() => { if (map.current) map.current.invalidateSize(); }, 100);
    }
  }, [view]);

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

  const handleSearch = useCallback(async (term) => {
    const trimmed = term.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;
    setLoading(true);
    setActiveService(trimmed);
    setHasSearched(true);
    setShowSuggestions(false);

    const { data } = await supabase.rpc('search_providers', {
      viewer_lat: viewerLat, viewer_lng: viewerLng, service_slug: trimmed,
      max_distance_meters: radius, p_limit: 50, p_cursor_distance: null, p_cursor_id: null,
    });

    const enriched = await enrichCards(data || []);
    setProviders(enriched);
    setLoading(false);
  }, [viewerLat, viewerLng, radius]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach(m => m.remove());
    markers.current = [];
    if (providers.length === 0) return;
    const bounds = L.latLngBounds();
    bounds.extend([viewerLat, viewerLng]);

    providers.forEach(provider => {
      const markerIcon = L.divIcon({
        html: `<div style="width:42px;height:42px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 10px rgba(0,0,0,0.15);border:${provider.isActive ? '2px solid #34c759' : '2px solid #007aff'};overflow:hidden;">${provider.profile_pic_url ? `<img src="${provider.profile_pic_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8e8e93" stroke-width="1.2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>'}</div>`,
        className: '', iconSize: [42, 42], iconAnchor: [21, 21],
      });
      const marker = L.marker([provider.workspace_lat, provider.workspace_lng], { icon: markerIcon }).addTo(map.current);
      marker.on('click', () => setSelectedUser(provider));
      markers.current.push(marker);
      bounds.extend([provider.workspace_lat, provider.workspace_lng]);
    });
    map.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [providers, viewerLat, viewerLng]);

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

  const handleListScroll = () => {
    if (listScrollRef.current) {
      const scrollTop = listScrollRef.current.scrollTop;
      setShowScrollTop(scrollTop > 500);
      if (scrollTop > prevScrollY.current && scrollTop > 60) {
        setShowChipsSlider(false);
      } else if (scrollTop < 20) {
        setShowChipsSlider(true);
      }
      prevScrollY.current = scrollTop;
    }
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
    setShowChipsSlider(true);
  };

  const filteredSuggestions = services.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 6);

  const handleChipTap = (slug) => {
    setSearchTerm(slug.replace(/-/g, ' '));
    handleSearch(slug);
  };

  const scrollToListTop = () => {
    listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="search-screen">
      <div className="search-floating-bar">
        <div className="search-input-wrapper search-input-transparent">
          <span className="search-icon"><IconSearch /></span>
          <input
            type="text" value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
            onFocus={handleInputFocus}
            placeholder="Search services..."
            className="search-input-field"
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => { setSearchTerm(''); setProviders([]); setActiveService(null); setHasSearched(false); }}>✕</button>
          )}
        </div>

        {showSuggestions && searchTerm && filteredSuggestions.length > 0 && (
          <div className="search-suggestions">
            {filteredSuggestions.map(s => (
              <div key={s.id} className="suggestion-item" onClick={() => { setSearchTerm(s.name); handleSearch(s.name); }}>
                <span className="suggestion-name">{s.name}</span>
                <span className="suggestion-category">{s.category}</span>
              </div>
            ))}
          </div>
        )}

        <div className={`chips-slider-container ${showChipsSlider ? 'visible' : ''}`}>
          <div className="chips-scroll">
            {POPULAR_SERVICES.map(slug => (
              <button key={slug} className={`chip-btn ${activeService === slug ? 'active' : ''}`} onClick={() => handleChipTap(slug)}>
                {slug.replace(/-/g, ' ')}
              </button>
            ))}
          </div>

          <div className="radius-bar">
            <div className="radius-label">
              <span>Radius</span>
              <span className="radius-value">{formatDistance(radius)}</span>
            </div>
            <input type="range" min="1000" max="20000" step="100" value={radius}
              onChange={e => {
                const val = Number(e.target.value);
                setRadius(val);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => { if (activeService) handleSearch(activeService); }, 400);
              }}
              className="radius-slider"
            />
            <div className="radius-limits"><span>1km</span><span>20km</span></div>
          </div>
        </div>

        <div className="view-toggle">
          <button className={`toggle-btn ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')}><IconMap /> Map</button>
          <button className={`toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}><IconList /> List</button>
        </div>
      </div>

      <div className={`search-map-full ${view === 'map' ? 'view-visible' : 'view-hidden'}`}>
        <div ref={mapContainer} className="search-map-full-inner" />
        {!hasSearched && !loading && (
          <div className="map-empty-overlay">
            <div className="map-empty-card">
              <p className="map-empty-title">Find providers near you</p>
              <p className="map-empty-sub">Tap a service above or search</p>
            </div>
          </div>
        )}
        {loading && (<div className="search-map-loading"><div className="load-more-spinner" /></div>)}
        {hasSearched && !loading && providers.length === 0 && (
          <div className="search-map-empty"><p>No providers found</p><p className="search-map-empty-sub">Try a different service or increase radius</p></div>
        )}
      </div>

      <div className={`search-list-scroll ${view === 'list' ? 'view-visible' : 'view-hidden'}`} ref={listScrollRef} onScroll={handleListScroll}>
        {!hasSearched && !loading && (
          <div className="search-list-empty-state">
            <div className="list-empty-icon"><IconSearch /></div>
            <p className="list-empty-title">Search for a service</p>
            <p className="list-empty-sub">to see providers near you</p>
          </div>
        )}
        {loading && (
          <div className="search-list-scroll-inner">
            {[1,2,3,4].map(i => <div key={i} className="skeleton-list-card" />)}
          </div>
        )}
        {hasSearched && !loading && providers.length === 0 && (
          <div className="search-list-empty">
            <p>No providers found for "{activeService?.replace(/-/g, ' ')}"</p>
            <p className="search-list-empty-sub">Try a different service or increase radius</p>
          </div>
        )}
        {providers.map(provider => (
          <div key={provider.id} className="search-card-bleed" onClick={() => setSelectedUser(provider)}>
            {provider.profile_pic_url ? (
              <img src={provider.profile_pic_url} alt={provider.full_name} />
            ) : (
              <div className="card-avatar-placeholder"><IconAvatar /></div>
            )}
            <div className="search-card-overlay">
              <div className="provider-card-name">
                {provider.isActive && <span className="active-dot-card" />}
                {provider.full_name}
              </div>
              <div className="provider-card-distance">{formatDistance(provider.distance_meters)}</div>
              <div className="provider-card-services">
                {provider.services?.slice(0, 2).map(s => s.replace(/-/g, ' ')).join(', ') || 'No services'}
              </div>
              <div className="provider-card-rating">
                {provider.rating !== 'New' ? `★ ${provider.rating} · ${provider.gigsThisMonth || 0} gigs` : 'New'}
              </div>
            </div>
          </div>
        ))}
        {showScrollTop && (
          <button className="scroll-to-top" onClick={scrollToListTop}><IconArrowUp /></button>
        )}
      </div>

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
              <h2>{selectedUser.full_name} {selectedUser.isActive && <span className="active-dot-card" />}</h2>
              {selectedUser.rating !== 'New' ? (
                <>
                  <div className="sheet-stars">{renderStars(selectedUser.rating)}</div>
                  <div className="sheet-rating-count">{selectedUser.rating} · {selectedUser.review_count || 0} review{selectedUser.review_count !== 1 ? 's' : ''}</div>
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
                <div className="sheet-address"><IconMapPin />{selectedUser.workspace_address}</div>
              )}
              {selectedUser.services?.length > 0 && (
                <div className="sheet-services-chips">
                  {selectedUser.services.map(s => <span key={s} className="sheet-service-chip">{s.replace(/-/g, ' ')}</span>)}
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

      {showSuggestions && <div className="suggestions-overlay" onClick={() => setShowSuggestions(false)} />}
    </div>
  );
}

export default SearchScreen;
