import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet-rotate';

const POPULAR_SERVICES = [
  'barbing', 'tailoring', 'makeup', 'hairdressing',
  'electrical', 'plumbing', 'auto-mechanic', 'photography'
];

function SearchScreen({ onStartChat, onViewProfile }) {
  const [view, setView] = useState('map');
  const [searchTerm, setSearchTerm] = useState('');
  const [radius, setRadius] = useState(1000);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewerLat, setViewerLat] = useState(9.0765);
  const [viewerLng, setViewerLng] = useState(7.3986);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeService, setActiveService] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [services, setServices] = useState([]);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const viewerMarker = useRef(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setViewerLat(pos.coords.latitude);
          setViewerLng(pos.coords.longitude);
        },
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    supabase.rpc('get_services').then(({ data }) => {
      if (data) setServices(data);
    });
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current, {
      center: [viewerLat, viewerLng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map.current);

    const vIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;background:#007aff;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,122,255,0.4);"></div>',
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    viewerMarker.current = L.marker([viewerLat, viewerLng], { icon: vIcon }).addTo(map.current);
  }, [viewerLat, viewerLng]);

  useEffect(() => {
    if (map.current) {
      map.current.setView([viewerLat, viewerLng], map.current.getZoom());
      if (viewerMarker.current) {
        viewerMarker.current.setLatLng([viewerLat, viewerLng]);
      }
    }
  }, [viewerLat, viewerLng]);

  useEffect(() => {
    if (view === 'map' && map.current) {
      setTimeout(() => { if (map.current) map.current.invalidateSize(); }, 200);
    }
  }, [view]);

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

  const handleSearch = useCallback(async (term) => {
    const trimmed = term.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;

    setLoading(true);
    setActiveService(trimmed);
    setHasSearched(true);
    setShowSuggestions(false);

    const { data } = await supabase.rpc('search_providers', {
      viewer_lat: viewerLat,
      viewer_lng: viewerLng,
      service_slug: trimmed,
      max_distance_meters: radius,
      p_limit: 50,
      p_cursor_distance: null,
      p_cursor_id: null,
    });

    const enriched = await enrichCards(data || []);
    setProviders(enriched);
    setLoading(false);
  }, [viewerLat, viewerLng, radius]);

  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((m) => m.remove());
    markers.current = [];

    if (providers.length === 0) return;

    const bounds = L.latLngBounds();
    bounds.extend([viewerLat, viewerLng]);

    providers.forEach((provider) => {
      const markerIcon = L.divIcon({
        html: `<div style="
          width:42px;height:42px;
          background:white;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:22px;
          box-shadow:0 2px 10px rgba(0,0,0,0.15);
          border:${provider.isActive ? '2px solid #34c759' : '2px solid #007aff'};
          overflow:hidden;
        ">${
          provider.profile_pic_url
            ? `<img src="${provider.profile_pic_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
            : '👤'
        }</div>`,
        className: '',
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      const marker = L.marker(
        [provider.workspace_lat, provider.workspace_lng],
        { icon: markerIcon }
      ).addTo(map.current);

      marker.on('click', () => setSelectedUser(provider));
      markers.current.push(marker);
      bounds.extend([provider.workspace_lat, provider.workspace_lng]);
    });

    map.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [providers, viewerLat, viewerLng]);

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const filteredSuggestions = services.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 6);

  const handleChipTap = (slug) => {
    setSearchTerm(slug.replace(/-/g, ' '));
    handleSearch(slug);
  };

  return (
    <div className="search-screen">
      <div className="search-header">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search services..."
            className="search-input-field"
          />
          {searchTerm && (
            <button
              className="search-clear"
              onClick={() => {
                setSearchTerm('');
                setProviders([]);
                setActiveService(null);
                setHasSearched(false);
              }}
            >
              ✕
            </button>
          )}
        </div>

        {showSuggestions && searchTerm && filteredSuggestions.length > 0 && (
          <div className="search-suggestions">
            {filteredSuggestions.map((s) => (
              <div
                key={s.id}
                className="suggestion-item"
                onClick={() => {
                  setSearchTerm(s.name);
                  handleSearch(s.name);
                }}
              >
                <span className="suggestion-name">{s.name}</span>
                <span className="suggestion-category">{s.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chips-scroll">
        {POPULAR_SERVICES.map((slug) => (
          <button
            key={slug}
            className={`chip-btn ${activeService === slug ? 'active' : ''}`}
            onClick={() => handleChipTap(slug)}
          >
            {slug.replace(/-/g, ' ')}
          </button>
        ))}
      </div>

      <div className="radius-bar">
        <div className="radius-label">
          <span>Radius</span>
          <span className="radius-value">{formatDistance(radius)}</span>
        </div>
        <input
          type="range"
          min="1000"
          max="20000"
          step="100"
          value={radius}
          onChange={(e) => {
            const val = Number(e.target.value);
            setRadius(val);
            if (activeService) handleSearch(activeService);
          }}
          className="radius-slider"
        />
        <div className="radius-limits">
          <span>1km</span>
          <span>20km</span>
        </div>
      </div>

      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >
          🗺️ Map
        </button>
        <button
          className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          📋 List
        </button>
      </div>

      <div className={`search-map-container ${view === 'map' ? 'view-visible' : 'view-hidden'}`}>
        <div ref={mapContainer} className="search-map" />

        {!hasSearched && !loading && (
          <div className="map-empty-overlay">
            <div className="map-empty-card">
              <p className="map-empty-title">Find providers near you</p>
              <p className="map-empty-sub">Tap a service above or search</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="search-map-loading">
            <div className="spinner"></div>
          </div>
        )}

        {hasSearched && !loading && providers.length === 0 && (
          <div className="search-map-empty">
            <p>No providers found</p>
            <p className="search-map-empty-sub">Try a different service or increase radius</p>
          </div>
        )}
      </div>

      <div className={`search-list ${view === 'list' ? 'view-visible' : 'view-hidden'}`}>
        {!hasSearched && !loading && (
          <div className="search-list-empty-state">
            <div className="list-empty-icon">📋</div>
            <p className="list-empty-title">Search for a service</p>
            <p className="list-empty-sub">to see providers near you</p>
          </div>
        )}

        {loading && (
          <div className="search-list-loading">
            <div className="spinner"></div>
          </div>
        )}

        {hasSearched && !loading && providers.length === 0 && (
          <div className="search-list-empty">
            <p>No providers found for "{activeService?.replace(/-/g, ' ')}"</p>
            <p className="search-list-empty-sub">Try a different service or increase radius</p>
          </div>
        )}

        {providers.map((provider) => (
          <div
            key={provider.id}
            className="user-card search-card"
            onClick={() => setSelectedUser(provider)}
          >
            <div className="card-avatar">
              {provider.profile_pic_url ? (
                <img src={provider.profile_pic_url} alt={provider.full_name} />
              ) : (
                <div className="card-avatar-placeholder">👤</div>
              )}
            </div>
            <div className="card-info">
              <h3>{provider.full_name} {provider.isActive && <span className="active-dot-card"></span>}</h3>
              <p className="card-services">
                {provider.services?.slice(0, 3).map((s) => s.replace(/-/g, ' ')).join(', ')}
              </p>
              <p className="card-distance">{formatDistance(provider.distance_meters)}</p>
              <p className="card-gigs">{provider.gigCount || 0} gigs</p>
            </div>
            <div className="card-rating">
              {provider.rating !== 'New' ? (
                <span className="rating-badge rating-badge-active">⭐ {provider.rating}</span>
              ) : (
                <span className="rating-badge">New</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedUser && (
        <div className="bottom-sheet-overlay" onClick={() => setSelectedUser(null)}>
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
                {selectedUser.services?.map((s) => s.replace(/-/g, ' ')).join(' • ')}
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

      {showSuggestions && (
        <div className="suggestions-overlay" onClick={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}

export default SearchScreen;
