import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import L from 'leaflet';
import 'leaflet-rotate';

function EditProfileScreen({ onBack }) {
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [services, setServices] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [customService, setCustomService] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);

  useEffect(() => {
    loadProfile();
    loadAllServices();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setFullName(data.full_name || '');
      setBio(data.bio || '');
      setPhone(data.phone || '');
      setProfilePic(data.profile_pic_url || null);
      setSelectedServices(data.services || []);
      setAddress(data.workspace_address || '');
      setLat(data.workspace_lat || null);
      setLng(data.workspace_lng || null);
    }
    setLoading(false);
  };

  const loadAllServices = async () => {
    const { data } = await supabase.rpc('get_services');
    if (data) setAllServices(data);
  };

  useEffect(() => {
    if (lat === null || lng === null || !mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map.current);

    const markerIcon = L.divIcon({
      html: '<div style="font-size:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));transform:translate(-50%,-100%);">📍</div>',
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    marker.current = L.marker([lat, lng], { icon: markerIcon }).addTo(map.current);

    map.current.on('moveend', () => {
      const center = map.current.getCenter();
      setLat(center.lat);
      setLng(center.lng);
      marker.current.setLatLng([center.lat, center.lng]);
      reverseGeocode(center.lat, center.lng);
    });
  }, [lat, lng]);

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { headers: { 'User-Agent': 'GigsCourt/0.0.1' } }
      );
      const data = await res.json();
      if (data.display_name) setAddress(data.display_name);
    } catch {}
  };

  const toggleService = (slug) => {
    setSelectedServices((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const requestCustomService = async () => {
    if (!customService.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('service_requests').insert({
      user_id: user.id,
      requested_name: customService.trim(),
    });
    const tempSlug = customService.trim().toLowerCase().replace(/\s+/g, '-');
    setSelectedServices((prev) => [...prev, tempSlug]);
    setCustomService('');
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL);
      const auth = await authRes.json();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', 'profile.jpg');
      formData.append('folder', '/profiles');
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
      setProfilePic(result.url);
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError('Name is required');
      return;
    }
    if (!bio.trim()) {
      setError('Bio is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }
    if (selectedServices.length === 0) {
      setError('Select at least one service');
      return;
    }
    if (!address.trim()) {
      setError('Workspace address is required');
      return;
    }

    setSaving(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName.trim(),
      bio: bio.trim(),
      phone: phone.trim(),
      profile_pic_url: profilePic,
      services: selectedServices,
      workspace_lat: lat,
      workspace_lng: lng,
      workspace_address: address.trim(),
      updated_at: new Date().toISOString(),
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      onBack();
    }

    setSaving(false);
  };

  const filteredServices = allServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const groupedServices = {};
  filteredServices.forEach((s) => {
    if (!groupedServices[s.category]) groupedServices[s.category] = [];
    groupedServices[s.category].push(s);
  });

  if (loading) {
    return (
      <div className="edit-profile-screen">
        <div className="edit-profile-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-profile-screen">
      <div className="edit-profile-header">
        <button onClick={onBack} className="edit-profile-back">←</button>
        <h2>Edit Profile</h2>
        <button onClick={handleSave} disabled={saving} className="edit-profile-save">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="edit-profile-body">
        <div className="edit-section">
          <label>Profile Picture</label>
          <div className="profile-pic-section">
            <div className="avatar-wrapper" onClick={handleAvatarClick}>
              <div className={`avatar-circle ${profilePic ? 'has-photo' : ''}`}>
                {profilePic ? <img src={profilePic} alt="" /> : <span>👤</span>}
              </div>
              {!uploading && (
                <div className="avatar-overlay"><span>+</span></div>
              )}
              {uploading && (
                <div className="avatar-uploading"><div className="spinner"></div></div>
              )}
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
          </div>
        </div>

        <div className="edit-section">
          <label>Full Name / Business Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="onboarding-input"
          />
        </div>

        <div className="edit-section">
          <label>Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="onboarding-textarea"
            rows={4}
          />
        </div>

        <div className="edit-section">
          <label>Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="onboarding-input"
          />
        </div>

        <div className="edit-section">
          <label>Services</label>
          {selectedServices.length > 0 && (
            <div className="selected-tags">
              {selectedServices.map((slug) => (
                <span key={slug} className="tag" onClick={() => toggleService(slug)}>
                  {slug.replace(/-/g, ' ')} ✕
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            placeholder="Search services..."
            className="onboarding-input search-input"
          />
          <div className="services-list">
            {Object.keys(groupedServices).map((category) => (
              <div key={category} className="service-category">
                <h4>{category}</h4>
                <div className="service-chips">
                  {groupedServices[category].map((s) => (
                    <button
                      key={s.id}
                      className={`chip ${selectedServices.includes(s.slug) ? 'chip-selected' : ''}`}
                      onClick={() => toggleService(s.slug)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="custom-service">
            <p>Can't find your service?</p>
            <div className="custom-row">
              <input
                type="text"
                value={customService}
                onChange={(e) => setCustomService(e.target.value)}
                placeholder="Type your service..."
                className="onboarding-input"
              />
              <button onClick={requestCustomService} className="add-btn">Add</button>
            </div>
          </div>
        </div>

        <div className="edit-section">
          <label>Workspace Location</label>
          <div className="map-container" style={{ height: 250 }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
          </div>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your workspace address"
            className="onboarding-input"
            style={{ marginTop: 8 }}
          />
        </div>

        {error && <p className="onboarding-error">{error}</p>}
      </div>
    </div>
  );
}

export default EditProfileScreen;
