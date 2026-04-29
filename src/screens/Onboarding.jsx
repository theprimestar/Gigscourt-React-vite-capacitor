import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { imagekitPublicKey } from '../lib/imagekit';
import { IMAGEKIT_AUTH_URL } from '../lib/config';
import L from 'leaflet';
import 'leaflet-rotate';
import '../Onboarding.css';

// SVG Icons
const IconPhoto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8.5" cy="10.5" r="2.5"/><path d="M22 14l-5-5-7 7-4-4-4 4"/>
  </svg>
);

const IconMapPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
  </svg>
);

const IconMessage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3.34a10 10 0 1 1-14.66 11.32"/><path d="M16.5 8.5l-6 6-4-4"/>
  </svg>
);

const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconLocationRefresh = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
  </svg>
);

// Step 1: Name + Services
function StepNameServices({ onNext }) {
  const [fullName, setFullName] = useState('');
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [customService, setCustomService] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchServices(); }, []);

  const fetchServices = async () => {
    const { data } = await supabase.rpc('get_services');
    if (data) setServices(data);
    setLoading(false);
  };

  const toggleService = (slug) => {
    setSelectedServices(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  const requestCustomService = async () => {
    if (!customService.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('service_requests').insert({ user_id: user.id, requested_name: customService.trim() });
    setSelectedServices(prev => [...prev, customService.trim().toLowerCase().replace(/\s+/g, '-')]);
    setCustomService('');
  };

  const handleNext = () => {
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (selectedServices.length === 0) { setError('Please select at least one service'); return; }
    onNext({ fullName: fullName.trim(), services: selectedServices });
  };

  const filteredServices = services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  const groupedServices = {};
  filteredServices.forEach(s => {
    if (!groupedServices[s.category]) groupedServices[s.category] = [];
    groupedServices[s.category].push(s);
  });

  return (
    <div className="onboarding-step">
      <h2>Tell us about yourself</h2>
      <p className="step-sub">This helps clients find you</p>

      <label>Full Name / Business Name</label>
      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. John Doe or JD Barbing" className="onboarding-input" />

      <label>What services do you offer?</label>
      <input type="text" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} placeholder="Search services..." className="onboarding-input" style={{ marginBottom: 10 }} />

      {selectedServices.length > 0 && (
        <div className="selected-tags">
          {selectedServices.map(slug => (
            <span key={slug} className="tag" onClick={() => toggleService(slug)}>{slug.replace(/-/g, ' ')} ✕</span>
          ))}
        </div>
      )}

      <div className="services-list">
        {loading ? (
          Object.keys(groupedServices).length === 0 ? (
            <div>
              {['Category', 'Category'].map((_, ci) => (
                <div key={ci} className="service-category">
                  <h4><span className="skeleton-chip skeleton-chip-narrow" style={{ height: 14, width: 60 }}></span></h4>
                  <div className="service-chips">
                    {[1,2,3,4].map(i => <span key={i} className="skeleton-chip" style={{ width: [80,100,70,90][i-1] }}></span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : null
        ) : (
          Object.keys(groupedServices).map(category => (
            <div key={category} className="service-category">
              <h4>{category}</h4>
              <div className="service-chips">
                {groupedServices[category].map(s => (
                  <button key={s.id} className={`chip ${selectedServices.includes(s.slug) ? 'chip-selected' : ''}`} onClick={() => toggleService(s.slug)}>{s.name}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="custom-service">
        <p>Can't find your service?</p>
        <div className="custom-row">
          <input type="text" value={customService} onChange={e => setCustomService(e.target.value)} placeholder="Type your service..." className="onboarding-input" />
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

  useEffect(() => { getCurrentLocation(); return () => { if (map.current) map.current.remove(); }; }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) { setLat(9.0765); setLng(7.3986); setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); reverseGeocode(pos.coords.latitude, pos.coords.longitude); setLoading(false); }, () => { setLat(9.0765); setLng(7.3986); setLoading(false); });
  };

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`, { headers: { 'User-Agent': 'GigsCourt/0.0.1' } });
      const data = await res.json();
      if (data.display_name) setAddress(data.display_name);
    } catch {}
  };

  useEffect(() => {
    if (lat === null || lng === null || !mapContainer.current || map.current) return;
    map.current = L.map(mapContainer.current, { center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 20 }).addTo(map.current);
    const markerIcon = L.divIcon({ html: '<div style="font-size:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));transform:translate(-50%,-100%);"><svg viewBox="0 0 24 24" width="32" height="32" fill="#1a3a8a" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg></div>', className: '', iconSize: [32, 32], iconAnchor: [16, 32] });
    marker.current = L.marker([lat, lng], { icon: markerIcon }).addTo(map.current);
    map.current.on('move', () => { const c = map.current.getCenter(); marker.current.setLatLng([c.lat, c.lng]); });
    map.current.on('moveend', () => { const c = map.current.getCenter(); setLat(c.lat); setLng(c.lng); reverseGeocode(c.lat, c.lng); });
  }, [lat, lng]);

  const handleNext = () => {
    if (!address.trim()) { setError('Please enter your workspace address'); return; }
    if (!lat || !lng) { setError('Please set your workspace location'); return; }
    onNext({ workspaceLat: lat, workspaceLng: lng, workspaceAddress: address.trim() });
  };

  return (
    <div className="onboarding-step" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div>
        <h2>Where do you work?</h2>
        <p className="step-sub">Set your workspace location so clients can find you.</p>
      </div>

      <div className="map-container">
        {loading ? <div className="skeleton-map"></div> : <div ref={mapContainer} style={{ width: '100%', height: '100%', zIndex: 1 }} />}
        {!loading && (
          <button onClick={() => { navigator.geolocation.getCurrentPosition(pos => { map.current.setView([pos.coords.latitude, pos.coords.longitude], 16); setLat(pos.coords.latitude); setLng(pos.coords.longitude); reverseGeocode(pos.coords.latitude, pos.coords.longitude); }); }} className="map-refresh-btn">
            <IconLocationRefresh /> My Location
          </button>
        )}
      </div>

      <label>Workspace Address</label>
      <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Your workspace address" className="onboarding-input" />
      <p className="map-address-hint">You can edit this to your preferred address</p>

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

  const handleSkip = () => onNext({ bio: bio.trim(), phone: phone.trim(), profilePicUrl: null });
  const handleNext = () => {
    if (!bio.trim()) { setError('Please tell us about yourself'); return; }
    if (!phone.trim()) { setError('Please enter your phone number'); return; }
    onNext({ bio: bio.trim(), phone: phone.trim(), profilePicUrl: profilePic });
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
      formData.append('file', file); formData.append('fileName', 'profile.jpg'); formData.append('folder', '/profiles');
      formData.append('useUniqueFileName', 'true'); formData.append('publicKey', imagekitPublicKey);
      formData.append('token', auth.token); formData.append('signature', auth.signature); formData.append('expire', auth.expire);
      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: formData });
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

  return (
    <div className="onboarding-step">
      <h2>Your profile</h2>
      <p className="step-sub">Let clients know who you are</p>

      <label>Profile Picture</label>
      <div className="profile-pic-section">
        <div className="avatar-wrapper">
          <div className={`avatar-circle ${profilePic ? 'has-photo' : ''}`}>
            {profilePic ? <img src={profilePic} alt="" /> : <IconPhoto />}
            {profilePic && (
              <button className="remove-pic-btn" onClick={() => setProfilePic(null)}>✕</button>
            )}
            {uploading && (
              <div className="avatar-uploading"><div className="upload-pulse"></div></div>
            )}
          </div>
        </div>
        {!profilePic && (
          <button className="add-photo-btn" onClick={() => fileInputRef.current?.click()}>Add Photo +</button>
        )}
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      <label>Tell us about yourself</label>
      <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Describe your experience, skills, and what clients can expect..." className="onboarding-textarea" rows={4} />

      <label>Phone Number</label>
      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="onboarding-input" />

      {error && <p className="onboarding-error">{error}</p>}

      <div className="onboarding-buttons">
        <button onClick={onBack} className="onboarding-btn secondary">Back</button>
        {profilePic ? <button onClick={handleNext} className="onboarding-btn">Continue</button> : <button onClick={handleSkip} className="onboarding-btn secondary">Skip Photo</button>}
      </div>
    </div>
  );
}

// Step 4: Walkthrough
function StepWalkthrough({ onFinish }) {
  return (
    <div className="onboarding-step walkthrough">
      <div className="walkthrough-header">
        <div className="walkthrough-logo">
          <div className="wl-circle wl-circle-left"></div>
          <div className="wl-circle wl-circle-right"></div>
        </div>
        <h2>Welcome to GigsCourt</h2>
        <p className="step-sub">Your local service marketplace</p>
      </div>

      <div className="walkthrough-cards">
        <div className="walkthrough-card">
          <div className="walkthrough-icon"><IconMapPin /></div>
          <div>
            <h4>Find Services Nearby</h4>
            <p>Browse providers by distance. See their ratings, completed gigs, and active status before you reach out.</p>
          </div>
        </div>
        <div className="walkthrough-card">
          <div className="walkthrough-icon"><IconMessage /></div>
          <div>
            <h4>Chat and Connect</h4>
            <p>Message providers directly. Discuss your needs, ask questions, and agree on details before booking.</p>
          </div>
        </div>
        <div className="walkthrough-card">
          <div className="walkthrough-icon"><IconCheck /></div>
          <div>
            <h4>Register Gigs, Build Trust</h4>
            <p>After working with someone, register your gig. It builds your reputation and helps others find trusted providers.</p>
          </div>
        </div>
        <div className="walkthrough-card">
          <div className="walkthrough-icon"><IconStar /></div>
          <div>
            <h4>Your Reputation Grows</h4>
            <p>Every completed gig earns you a review. Reviews help you rank higher in search results. Each review costs 1 credit — you start with 5 free. Top up anytime to keep growing.</p>
          </div>
        </div>
      </div>

      <button onClick={onFinish} className="onboarding-btn finish-btn">Get Started</button>
      <div className="walkthrough-footer">
        <p>You can update your profile anytime from Settings</p>
      </div>
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
    if (step < 4) setStep(step + 1);
    else saveProfile(updated);
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const saveProfile = async (profileData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').upsert({
      id: user.id, full_name: profileData.fullName, services: profileData.services,
      workspace_lat: profileData.workspaceLat, workspace_lng: profileData.workspaceLng,
      workspace_address: profileData.workspaceAddress, bio: profileData.bio,
      phone: profileData.phone, profile_pic_url: profileData.profilePicUrl,
      onboarding_completed: true, updated_at: new Date().toISOString(),
    });
    onComplete();
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-progress">
        {[1, 2, 3, 4].map(i => <div key={i} className={`progress-dot ${i <= step ? 'active' : ''}`} />)}
      </div>
      {step === 1 && <StepNameServices onNext={handleNext} />}
      {step === 2 && <StepLocation onNext={handleNext} onBack={handleBack} />}
      {step === 3 && <StepPhotoBio onNext={handleNext} onBack={handleBack} />}
      {step === 4 && <StepWalkthrough onFinish={() => saveProfile(data)} />}
    </div>
  );
}

export default Onboarding;
