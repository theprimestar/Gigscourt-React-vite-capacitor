import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet-rotate';

const POPULAR_SERVICES = [
  'barbing', 'tailoring', 'makeup', 'hairdressing',
  'electrical', 'plumbing', 'auto-mechanic', 'photography'
];

function SearchScreen() {
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

  // Get viewer location
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

  // Fetch services for autocomplete
  useEffect(() => {
    supabase.rpc('get_services').then(({ data }) => {
      if (data) setServices(data);
    });
  }, []);

  // Initialize map
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

    // Add viewer location marker
    const vIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;background:#007aff;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,122,255,0.4);"></div>',
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    viewerMarker.current = L.marker([viewerLat, viewerLng], { icon: vIcon }).addTo(map.current);
  }, [viewerLat, viewerLng]);

  // Update map center when location changes
  useEffect(() => {
    if (map.current) {
      map.current.setView([viewerLat, viewerLng], map.current.getZoom());
      if (viewerMarker.current) {
        viewerMarker.current.setLatLng([viewerLat, viewerLng]);
      }
    }
  }, [viewerLat, viewerLng]);

  // Fix map size when switching to map view
  useEffect(() => {
    if (view === 'map' && map.current) {
      setTimeout(() => map.current.invalidateSize(), 100);
    }
  }, [view]);

  // Search function
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

    setProviders(data || []);
    setLoading(false);
  }, [viewerLat, viewerLng, radius]);

  // Update map markers when providers change
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
          border:2px solid #007aff;
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
      {/* Search Header */}
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

      {/* Service Chips */}
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

      {/* Radius Slider */}
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

      {/* View Toggle */}
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

      {/* Map View */}
      {view === 'map' && (
        <div className="search-map-container">
          <div ref={mapContainer} className="search-map" />

          {/* Empty State Overlay */}
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
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="search-list">
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
                <h3>{provider.full_name}</h3>
                <p className="card-services">
                  {provider.services?.slice(0, 3).map((s) => s.replace(/-/g, ' ')).join(', ')}
                </p>
                <p className="card-distance">{formatDistance(provider.distance_meters)}</p>
              </div>
              <div className="card-rating">
                <span className="rating-badge">New</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Sheet */}
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
              <h2>{selectedUser.full_name}</h2>
              <p className="sheet-distance">{formatDistance(selectedUser.distance_meters)}</p>
              <p className="sheet-address">{selectedUser.workspace_address || 'No address set'}</p>
              <p className="sheet-services">
                {selectedUser.services?.map((s) => s.replace(/-/g, ' ')).join(' • ')}
              </p>
              <button className="sheet-view-profile-btn">View Full Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* Tap overlay to close suggestions */}
      {showSuggestions && (
        <div className="suggestions-overlay" onClick={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}

export default SearchScreen;
