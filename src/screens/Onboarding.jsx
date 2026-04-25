import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitUrl, imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import L from 'leaflet';
import 'leaflet-rotate';

// Step 1: Name + Services
function StepNameServices({ onNext }) {
  const [fullName, setFullName] = useState('');
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [customService, setCustomService] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const { data, error } = await supabase.rpc('get_services');
    if (error) {
      setError('Failed to load services');
    } else {
      setServices(data || []);
    }
    setLoading(false);
  };

  const toggleService = (serviceSlug) => {
    setSelectedServices((prev) =>
      prev.includes(serviceSlug)
        ? prev.filter((s) => s !== serviceSlug)
        : [...prev, serviceSlug]
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

  const handleNext = () => {
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (selectedServices.length === 0) {
      setError('Please select at least one service');
      return;
    }
    onNext({ fullName: fullName.trim(), services: selectedServices });
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const groupedServices = {};
  filteredServices.forEach((s) => {
    if (!groupedServices[s.category]) groupedServices[s.category] = [];
    groupedServices[s.category].push(s);
  });

  if (loading) {
    return <div className="onboarding-step"><p>Loading services...</p></div>;
  }

  return (
    <div className="onboarding-step">
      <h2>Tell us about yourself</h2>
      <p className="step-sub">This helps clients find you</p>

      <label>Full Name / Business Name</label>
      <input
        type="text"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="e.g. John Doe or JD Barbing"
        className="onboarding-input"
      />

      <label>What services do you offer?</label>
      <input
        type="text"
        value={serviceSearch}
        onChange={(e) => setServiceSearch(e.target.value)}
        placeholder="Search services..."
        className="onboarding-input search-input"
      />

      {selectedServices.length > 0 && (
        <div className="selected-tags">
          {selectedServices.map((slug) => (
            <span key={slug} className="tag" onClick={() => toggleService(slug)}>
              {slug.replace(/-/g, ' ')} ✕
            </span>
          ))}
        </div>
      )}

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
        <p className="custom-note">Your request will be reviewed by our team.</p>
      </div>

      {error && <p className="onboarding-error">{error}</p>}

      <button onClick={handleNext} className="onboarding-btn">Continue</button>
    </div>
  );
}

// Step 2: Workspace Location
function StepLocation({ onNext, onBack }) {
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);

  useEffect(() => {
    getCurrentLocation();
    return () => {
      if (map.current) map.current.remove();
    };
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      setLat(9.0765);
      setLng(7.3986);
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        reverseGeocode(position.coords.latitude, position.coords.longitude);
        setLoading(false);
      },
      () => {
        setError('Unable to get your location. Using default.');
        setLat(9.0765);
        setLng(7.3986);
        setLoading(false);
      }
    );
  };

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        {
          headers: {
            'User-Agent': 'GigsCourt/0.0.1',
          },
        }
      );
      const data = await res.json();
      if (data.display_name) {
        setAddress(data.display_name);
      }
    } catch {
      // Address remains editable by user
    }
  };

  // Initialize map when lat/lng are set
  useEffect(() => {
    if (lat === null || lng === null) return;
    if (map.current) return;

    map.current = L.map(mapContainer.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
      rotate: true,
      touchRotate: true,
    });

    // Stylish CartoDB Positron tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map.current);

    // Add rotation control
    L.control.rotate({ position: 'topright' }).addTo(map.current);

    // Custom marker icon
    const markerIcon = L.divIcon({
      html: '<div style="font-size:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));transform:translate(-50%,-100%);">📍</div>',
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    marker.current = L.marker([lat, lng], { icon: markerIcon, draggable: false }).addTo(map.current);

    // Update center pin when map moves
    map.current.on('move', () => {
      const center = map.current.getCenter();
      marker.current.setLatLng([center.lat, center.lng]);
    });

    // Update address when map stops moving
    map.current.on('moveend', () => {
      const center = map.current.getCenter();
      setLat(center.lat);
      setLng(center.lng);
      reverseGeocode(center.lat, center.lng);
    });
  }, [lat, lng]);

  const handleNext = () => {
    if (!address.trim()) {
      setError('Please enter your workspace address');
      return;
    }
    if (!lat || !lng) {
      setError('Please set your workspace location');
      return;
    }
    onNext({
      workspaceLat: lat,
      workspaceLng: lng,
      workspaceAddress: address.trim(),
    });
  };

  if (loading) {
    return (
      <div className="onboarding-step">
        <p>Getting your location...</p>
      </div>
    );
  }

  return (
    <div className="onboarding-step">
      <h2>Where do you work?</h2>
      <p className="step-sub">Set your workspace location so clients can find you. Drag the map, pinch to zoom, and rotate with two fingers.</p>

      <div className="map-container">
        <div ref={mapContainer} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        <button onClick={() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              map.current.setView([pos.coords.latitude, pos.coords.longitude], 16);
              setLat(pos.coords.latitude);
              setLng(pos.coords.longitude);
              reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            }
          );
        }} className="map-refresh-btn">
          📍 My Location
        </button>
      </div>

      <label>Workspace Address</label>
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Your workspace address"
        className="onboarding-input"
      />

      {error && <p className="onboarding-error">{error}</p>}

      <div className="onboarding-buttons">
        <button onClick={onBack} className="onboarding-btn secondary">Back</button>
        <button onClick={handleNext} className="onboarding-btn">Continue</button>
      </div>
    </div>
  );
}

// Step 3: Profile Picture + Bio + Phone
function StepPhotoBio({ onNext, onBack }) {
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleSkip = () => {
    onNext({ bio: bio.trim(), phone: phone.trim(), profilePicUrl: null });
  };

  const handleNext = () => {
    if (!bio.trim()) {
      setError('Please tell us about yourself');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    onNext({ bio: bio.trim(), phone: phone.trim(), profilePicUrl: profilePic });
  };

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

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

      if (!uploadRes.ok) {
        throw new Error(result.message || 'Upload failed');
      }

      setProfilePic(result.url);
    } catch (err) {
      setError('Upload failed. Please try again.');
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="onboarding-step">
      <h2>Your profile</h2>
      <p className="step-sub">Let clients know who you are</p>

      <label>Profile Picture (optional)</label>

      <div className="profile-pic-section">
        <div className="avatar-wrapper">
          <div className={`avatar-circle ${profilePic ? 'has-photo' : ''}`}>
            {profilePic ? (
              <img src={profilePic} alt="Profile" />
            ) : (
              <span>👤</span>
            )}
          </div>
          {!uploading && (
            <div className="avatar-overlay" onClick={handleAvatarClick}>
              <span>+</span>
            </div>
          )}
          {uploading && (
            <div className="avatar-uploading">
              <div className="spinner"></div>
            </div>
          )}
        </div>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {profilePic && (
          <button onClick={() => setProfilePic(null)} className="remove-pic">
            Remove photo
          </button>
        )}
      </div>

      <label>Tell us about yourself</label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Describe your experience, skills, and what clients can expect..."
        className="onboarding-textarea"
        rows={4}
      />

      <label>Phone Number</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+234 800 000 0000"
        className="onboarding-input"
      />

      {error && <p className="onboarding-error">{error}</p>}

      <div className="onboarding-buttons">
        <button onClick={onBack} className="onboarding-btn secondary">Back</button>
        {profilePic ? (
          <button onClick={handleNext} className="onboarding-btn">Continue</button>
        ) : (
          <button onClick={handleSkip} className="onboarding-btn secondary">Skip Photo</button>
        )}
      </div>
    </div>
  );
}

// Step 4: App Walkthrough
function StepWalkthrough({ onFinish }) {
  return (
    <div className="onboarding-step walkthrough">
      <h2>Welcome to GigsCourt! 🎉</h2>
      <p className="step-sub">Here's how it works</p>

      <div className="walkthrough-cards">
        <div className="walkthrough-card">
          <span className="walkthrough-icon">🔍</span>
          <h4>Discover</h4>
          <p>Find service providers near you. Browse by distance, ratings, and active status.</p>
        </div>

        <div className="walkthrough-card">
          <span className="walkthrough-icon">💬</span>
          <h4>Chat</h4>
          <p>Message providers directly. Discuss details before booking.</p>
        </div>

        <div className="walkthrough-card">
          <span className="walkthrough-icon">⭐</span>
          <h4>Rate & Review</h4>
          <p>After a gig is completed, leave a review. It costs 1 credit to receive a review.</p>
        </div>

        <div className="walkthrough-card">
          <span className="walkthrough-icon">🪙</span>
          <h4>Credits</h4>
          <p>You get 5 free credits. Buy more to keep receiving reviews and growing your reputation.</p>
        </div>
      </div>

      <button onClick={onFinish} className="onboarding-btn finish-btn">
        Get Started
      </button>
    </div>
  );
}

// Main Onboarding Component
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({});

  const handleNext = (stepData) => {
    const updated = { ...data, ...stepData };
    setData(updated);

    if (step < 4) {
      setStep(step + 1);
    } else {
      saveProfile(updated);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const saveProfile = async (profileData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: profileData.fullName,
      services: profileData.services,
      workspace_lat: profileData.workspaceLat,
      workspace_lng: profileData.workspaceLng,
      workspace_address: profileData.workspaceAddress,
      bio: profileData.bio,
      phone: profileData.phone,
      profile_pic_url: profileData.profilePicUrl,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });

    onComplete();
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-progress">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`progress-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      {step === 1 && <StepNameServices onNext={handleNext} />}
      {step === 2 && <StepLocation onNext={handleNext} onBack={handleBack} />}
      {step === 3 && <StepPhotoBio onNext={handleNext} onBack={handleBack} />}
      {step === 4 && <StepWalkthrough onFinish={() => saveProfile(data)} />}
    </div>
  );
}

export default Onboarding;
