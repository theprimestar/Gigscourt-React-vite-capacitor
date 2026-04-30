import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL } from '../lib/config';
import { imagekitPublicKey } from '../lib/imagekit';
import { 
  getGigForChannel, registerGig, cancelGig, submitReview,
  checkExpiredGigs, shouldSendReminder, updateReminderSent 
} from '../gigSystem';
import '../Chat.css';

const IconBack = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);

const IconReply = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
  </svg>
);

const IconCopy = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const IconDelete = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconEdit = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconAddPhoto = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);

const IconMic = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const IconPause = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
  </svg>
);

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [gig, setGig] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);
  const photoQueue = useRef([]);
  const processingPhotos = useRef(false);
  const bannerDismissedByRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const actionBarRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible) init();
    return () => { isMounted.current = false; stopPolling(); unsubscribeChannel(); stopRecording(); };
  }, [chatId, otherUserId, isVisible]);

  useEffect(() => {
    if (actionMsg) {
      const close = (e) => { if (!actionBarRef.current?.contains(e.target)) setActionMsg(null); };
      document.addEventListener('mousedown', close);
      document.addEventListener('touchstart', close);
      return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
    }
  }, [actionMsg]);

  const init = async () => {
    setError(null); setLoading(true); seenIds.current = new Set();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);
      const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      if (isMounted.current && myProfile) setCurrentUserName(myProfile.full_name || '');
      const channelKey = chatId || [user.id, otherUserId].sort().join(':');
      channelIdRef.current = channelKey;
      await supabase.rpc('reset_unread', { p_user_id: user.id, p_channel_id: channelKey });
      await checkExpiredGigs(user.id);
      const currentGig = await getGigForChannel(channelKey);
      if (isMounted.current) setGig(currentGig);
      const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at, banner_dismissed_by').eq('id', channelKey).single();
      if (isMounted.current && channelData) {
        if (channelData.banner_dismissed_at && channelData.banner_dismissed_by === user.id) { setBannerDismissed(true); bannerDismissedByRef.current = user.id; }
        else { setBannerDismissed(false); bannerDismissedByRef.current = null; }
      }
      const { data: profile } = await supabase.from('profiles').select('full_name, profile_pic_url, id, onesignal_player_id').eq('id', otherUserId).single();
      if (isMounted.current) setOtherUser(profile || { full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
      await loadMessages(channelKey, user.id);
      if (isMounted.current) setLoading(false);
      subscribeToChannel(channelKey);
      startPolling(channelKey, user.id);
    } catch (err) { if (isMounted.current) { setError(err.message); setLoading(false); } }
  };

  const loadMessages = async (channelId, userId) => {
    const { data: history } = await supabase.rpc('get_messages', { p_channel_id: channelId, p_user_id: userId, p_cursor: null, p_cursor_id: null, p_limit: 50 });
    if (isMounted.current && history) {
      const sorted = [...history].reverse();
      sorted.forEach(m => seenIds.current.add(m.id));
      setMessages(sorted);
      setTimeout(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }, 100);
    }
  };

  const subscribeToChannel = (channelId) => {
    unsubscribeChannel();
    channelRef.current = supabase.channel(`chat:${channelId}`, { config: { broadcast: { self: true, ack: true } } });
    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      if (!isMounted.current) return;
      const msg = payload?.payload;
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => { if (prev.some(m => m.id === msg.id)) return prev; return [...prev, { ...msg, status: 'sent' }]; });
      scrollToBottom();
    });
    channelRef.current.subscribe();
  };

  const unsubscribeChannel = () => { if (channelRef.current) { channelRef.current.unsubscribe(); supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  const startPolling = (channelId, userId) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      if (!isMounted.current) return;
      const { data } = await supabase.rpc('get_messages', { p_channel_id: channelId, p_user_id: userId, p_cursor: null, p_cursor_id: null, p_limit: 50 });
      if (!data || !isMounted.current) return;
      setMessages(prev => prev.map(msg => { const updated = data.find(m => m.id === msg.id); if (updated && updated.is_read && msg.status !== 'read') return { ...msg, is_read: true, status: 'read' }; return msg; }));
      const newMessages = data.filter(m => !seenIds.current.has(m.id));
      if (newMessages.length > 0) {
        newMessages.forEach(m => seenIds.current.add(m.id));
        setMessages(prev => { const existing = new Set(prev.map(p => p.id)); const unique = newMessages.filter(m => !existing.has(m.id)); return [...prev, ...unique.map(m => ({ ...m, status: 'sent' }))].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); });
      }
      if (gig && isMounted.current) checkGigReminder(gig);
    }, 5000);
  };
  const stopPolling = () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } };

  const scrollToBottom = () => { setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100); };

  const handleReply = (msg) => { setReplyingTo(msg); setActionMsg(null); setEditingMsg(null); };
  const handleCopy = (text) => { navigator.clipboard.writeText(text).then(() => setActionMsg(null)).catch(() => {}); };
  const handleDeleteMsg = async (msgId, isMine) => {
    setActionMsg(null);
    if (isMine) {
      await supabase.from('messages').update({ deleted_by_sender: true }).eq('id', msgId);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted_by_sender: true } : m));
    } else {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    }
  };
  const handleEditMsg = (msg) => { setEditingMsg(msg); setEditText(msg.text); setActionMsg(null); setReplyingTo(null); };
  const submitEdit = async () => {
    if (!editText.trim() || !editingMsg) return;
    await supabase.from('messages').update({ text: editText.trim(), edited_at: new Date().toISOString() }).eq('id', editingMsg.id);
    setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: editText.trim(), edited_at: new Date().toISOString() } : m));
    setEditingMsg(null); setEditText('');
  };

  const handleLongPress = (e, msg) => { e.preventDefault(); setActionMsg(msg); setReplyingTo(null); setEditingMsg(null); };

  const handleRegisterGig = async () => { if (!currentUserId || !otherUserId) return; try { const result = await registerGig(channelIdRef.current, currentUserId, otherUserId); if (isMounted.current) setGig({ id: result.gig_id, status: 'pending_review', provider_id: currentUserId, client_id: otherUserId }); setBannerDismissed(false); } catch (err) { if (isMounted.current) setError(err.message); } };
  const handleSubmitReview = async () => { if (!gig || !currentUserId || reviewRating === 0) return; setSubmittingReview(true); try { await submitReview(gig.id, currentUserId, reviewRating, reviewText); if (isMounted.current) { setGig(null); setShowReviewForm(false); setReviewRating(0); setReviewText(''); setBannerDismissed(false); } } catch (err) { if (isMounted.current) setError(err.message); } finally { if (isMounted.current) setSubmittingReview(false); } };
  const handleCancelGig = async () => { if (!gig || !currentUserId) return; try { await cancelGig(gig.id, currentUserId); if (isMounted.current) { setGig(null); setBannerDismissed(false); } } catch (err) { if (isMounted.current) setError(err.message); } };
  const handleDismissBanner = async () => { const userId = currentUserId || (await supabase.auth.getUser()).data.user?.id; if (!userId) return; setBannerDismissed(true); bannerDismissedByRef.current = userId; await supabase.from('channels').update({ banner_dismissed_at: new Date().toISOString(), banner_dismissed_by: userId }).eq('id', channelIdRef.current); };

  const checkBannerReappear = async () => {
    if (!bannerDismissed || !bannerDismissedByRef.current) return;
    if (!currentUserId || bannerDismissedByRef.current !== currentUserId) return;
    const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at').eq('id', channelIdRef.current).single();
    if (!channelData?.banner_dismissed_at) return;
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('channel_id', channelIdRef.current).gt('created_at', channelData.banner_dismissed_at);
    if (count >= 8) { await supabase.from('channels').update({ banner_dismissed_at: null, banner_dismissed_by: null }).eq('id', channelIdRef.current); if (isMounted.current) { setBannerDismissed(false); bannerDismissedByRef.current = null; } }
  };

  const checkGigReminder = async (currentGig) => {
    if (!currentGig || currentGig.status !== 'pending_review') return;
    if (currentUserId === currentGig.client_id && shouldSendReminder(currentGig)) {
      if (otherUser?.onesignal_player_id) fetch(PUSH_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: 'Reminder' }, contents: { en: `Please rate your experience with ${otherUserName || 'the provider'}` }, data: { channel_id: channelIdRef.current } }) }).catch(() => {});
      await updateReminderSent(currentGig.id);
    }
  };

  const shouldShowBanner = () => { if (gig && gig.status === 'pending_review') return true; if (!gig && !bannerDismissed) return true; return false; };
  const getBannerText = () => {
    const otherName = otherUser?.full_name || otherUserName || 'this person';
    if (!gig) return `Did you complete a gig with ${otherName}? Tap Register Gig above to boost your reputation.`;
    if (gig.status === 'pending_review') { if (currentUserId === gig.provider_id) return `Waiting for ${otherName} to submit their review.`; return `Please submit your rating and review for ${otherName}. Tap Pending Gig above.`; }
    if (!bannerDismissed) return `Did you complete a gig with ${otherName}? Tap Register Gig above to boost your reputation.`;
    return null;
  };

  const sendTextMessage = async (text, tempId, replyToId = null) => {
    const channelKey = channelIdRef.current;
    try {
      const { data: savedMessage } = await supabase.rpc('send_message', { p_channel_key: channelKey, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: text });
      if (!savedMessage) throw new Error('Failed to send');
      if (replyToId) await supabase.from('messages').update({ reply_to_id: replyToId }).eq('id', savedMessage.id);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...savedMessage, reply_to_id: replyToId, status: 'sent' } : m));
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
      if (otherUser?.onesignal_player_id) fetch(PUSH_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: currentUserName || 'New message' }, contents: { en: text }, data: { channel_id: channelKey } }) }).catch(() => {});
      await checkBannerReappear();
    } catch (err) { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)); }
  };

  const processPhotoQueue = useCallback(async () => {
    if (processingPhotos.current || photoQueue.current.length === 0) return;
    processingPhotos.current = true;
    while (photoQueue.current.length > 0) { const item = photoQueue.current[0]; try { await uploadPhoto(item.file, item.tempId); } catch (err) { setMessages(prev => prev.map(m => m.id === item.tempId ? { ...m, status: 'failed' } : m)); } photoQueue.current.shift(); }
    processingPhotos.current = false;
  }, [otherUserId, otherUser, currentUserId, currentUserName]);

  const uploadPhoto = async (file, tempId) => {
    const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
    const formData = new FormData(); formData.append('file', file); formData.append('fileName', 'chat-photo.jpg'); formData.append('folder', '/chat-photos'); formData.append('useUniqueFileName', 'true'); formData.append('publicKey', imagekitPublicKey); formData.append('token', auth.token); formData.append('signature', auth.signature); formData.append('expire', auth.expire);
    const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: formData }); const result = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(result.message || 'Upload failed');
    const optimizedUrl = result.url + '?tr=f-webp,fo-lossless';
    const channelKey = channelIdRef.current;
    const { data: savedMessage } = await supabase.rpc('send_message', { p_channel_key: channelKey, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_image_url: optimizedUrl });
    if (!savedMessage) throw new Error('Failed to save photo');
    setMessages(prev => prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
    seenIds.current.add(savedMessage.id);
    if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    if (otherUser?.onesignal_player_id) fetch(PUSH_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: currentUserName || 'New photo' }, contents: { en: 'Photo' }, data: { channel_id: channelKey } }) }).catch(() => {});
    await checkBannerReappear();
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => { setRecordingTime(prev => { if (prev >= 59) { stopRecording(); return 60; } return prev + 1; }); }, 1000);
    } catch (err) { setError('Microphone access denied'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const uploadAudio = async (blob) => {
    const tempId = 'temp-audio-' + Date.now();
    const tempMsg = { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();
    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
      const formData = new FormData(); formData.append('file', blob, 'voice-message.webm'); formData.append('fileName', 'voice-message.webm'); formData.append('folder', '/chat-audio'); formData.append('useUniqueFileName', 'true'); formData.append('publicKey', imagekitPublicKey); formData.append('token', auth.token); formData.append('signature', auth.signature); formData.append('expire', auth.expire);
      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: formData }); const result = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(result.message || 'Upload failed');
      const channelKey = channelIdRef.current;
      const { data: savedMessage } = await supabase.rpc('send_message', { p_channel_key: channelKey, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_audio_url: result.url });
      if (!savedMessage) throw new Error('Failed to save audio');
      setMessages(prev => prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    } catch (err) { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)); }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;
    const text = newMessage.trim();
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    setNewMessage('');
    const replyToId = replyingTo?.id || null;
    setReplyingTo(null);
    const tempMsg = { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text, image_url: null, created_at: new Date().toISOString(), is_read: false, status: 'sending', reply_to_id: replyToId };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();
    sendTextMessage(text, tempId, replyToId);
  };

  const retryMessage = (tempId, text) => { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sending' } : m)); sendTextMessage(text, tempId); };
  const handlePhotoUpload = (e) => { const file = e.target.files?.[0]; if (!file || !currentUserId) return; const tempId = 'temp-photo-' + Date.now(); const tempMsg = { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' }; setMessages(prev => [...prev, tempMsg]); scrollToBottom(); photoQueue.current.push({ file, tempId }); processPhotoQueue(); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const getStatusText = (msg) => {
    if (msg.sender_id !== currentUserId) return null;
    switch (msg.status) {
      case 'sending': return <span className="message-status sending">...</span>;
      case 'sent': return <span className="message-status sent">Sent</span>;
      case 'read': return <span className="message-status read">Read</span>;
      case 'failed': return <button className="message-retry-btn" onClick={() => { if (msg.image_url || msg.audio_url) setError('Please reselect to retry'); else retryMessage(msg.id, msg.text); }}>Retry</button>;
      case 'uploading': return <span className="message-status sending">Uploading...</span>;
      default: return null;
    }
  };

  const formatTime = (timestamp) => { if (!timestamp) return ''; return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

  if (loading) return (<div className="chat-screen"><div className="chat-loading"><div className="spinner"></div></div></div>);

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn"><IconBack /></button>
        <div className="chat-header-info-tappable" onClick={() => { if (otherUser?.id && onViewProfile) onViewProfile({ id: otherUser.id, full_name: otherUser.full_name }); }}>
          <div className="chat-header-avatar">{otherUser?.profile_pic_url ? <img src={otherUser.profile_pic_url} alt="" /> : <div className="chat-header-avatar-placeholder"><IconAvatar /></div>}</div>
          <div className="chat-header-info"><h3>{otherUser?.full_name || 'User'}</h3></div>
        </div>
        {gig && gig.status === 'pending_review' ? (currentUserId === gig.provider_id ? <button onClick={handleCancelGig} className="chat-header-gig-btn">Cancel Gig</button> : <button onClick={() => setShowReviewForm(true)} className="chat-header-gig-btn">Pending Gig</button>) : <button onClick={handleRegisterGig} className="chat-header-gig-btn">Register Gig</button>}
      </div>

      {error && <div className="chat-error-banner" onClick={() => setError(null)}><span>{error}</span><button>✕</button></div>}

      {shouldShowBanner() && getBannerText() && (
        <div className={`gig-banner ${gig && gig.status === 'pending_review' ? 'gig-banner-persistent' : ''}`}>
          <div className="gig-banner-scroll"><p className="gig-banner-text">{getBannerText()}</p></div>
          {(!gig || gig.status !== 'pending_review') && <button onClick={handleDismissBanner} className="gig-banner-dismiss">✕</button>}
        </div>
      )}

      {showReviewForm && (
        <div className="bottom-sheet-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="bottom-sheet review-sheet" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <div className="bottom-sheet-content">
              <h2>Rate your experience</h2>
              <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 16 }}>How was your gig with {otherUser?.full_name || otherUserName || 'the provider'}?</p>
              <div className="star-selector">{[1,2,3,4,5].map(star => <button key={star} className={`star-btn ${star <= reviewRating ? 'star-active' : ''}`} onClick={() => setReviewRating(star)}>{star <= reviewRating ? '★' : '☆'}</button>)}</div>
              <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Write your review (optional)..." className="review-textarea" rows={3} />
              <button onClick={handleSubmitReview} disabled={reviewRating === 0 || submittingReview} className="onboarding-btn" style={{ marginTop: 12 }}>{submittingReview ? 'Submitting...' : 'Submit Review'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={chatContainerRef}>
        {messages.length === 0 && <div className="chat-empty"><p>No messages yet. Say hello!</p></div>}
        {messages.map(msg => {
          const isMine = msg.sender_id === currentUserId;
          const isDeleted = msg.deleted_by_sender;
          const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

          return (
            <div key={msg.id} className={`message-row ${isMine ? 'message-mine' : 'message-other'}`}>
              <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'} ${isDeleted ? 'bubble-deleted' : ''}`}
                onContextMenu={(e) => { e.preventDefault(); handleLongPress(e, msg); }}
                onTouchStart={(e) => { const timer = setTimeout(() => handleLongPress(e, msg), 500); e.target._longPress = timer; }}
                onTouchEnd={(e) => clearTimeout(e.target._longPress)}
                onTouchMove={() => {}}>
                {isDeleted ? <p className="message-text">This message was deleted</p> : (
                  <>
                    {repliedMsg && <div className="quoted-message"><div className="quoted-name">{repliedMsg.sender_id === currentUserId ? 'You' : (otherUser?.full_name || 'User')}</div><div className="quoted-text">{repliedMsg.text || (repliedMsg.image_url ? 'Photo' : 'Voice message')}</div></div>}
                    {msg.audio_url ? (
                      <div className="voice-message">
                        <button className="voice-play-btn" onClick={() => { const audio = new Audio(msg.audio_url); audio.play(); }}><IconPlay /></button>
                        <div className="voice-waveform">{[...Array(12)].map((_, i) => <div key={i} className="voice-wave-bar" style={{ height: `${Math.random() * 16 + 4}px` }} />)}</div>
                      </div>
                    ) : msg.image_url ? <img src={msg.image_url} alt="" className="chat-photo" onClick={() => setFullScreenImage(msg.image_url)} /> : null}
                    {editingMsg?.id === msg.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="text" value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: 'inherit', fontSize: 14, outline: 'none' }} autoFocus />
                        <button onClick={submitEdit} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '6px 10px', color: 'inherit', cursor: 'pointer', fontSize: 13 }}>Save</button>
                        <button onClick={() => setEditingMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, opacity: 0.7 }}>✕</button>
                      </div>
                    ) : msg.text ? <p className="message-text">{msg.text}</p> : null}
                  </>
                )}
                <span className="message-time">{formatTime(msg.created_at)}{msg.edited_at && !isDeleted ? ' (edited)' : ''}{isMine && getStatusText(msg)}</span>
              </div>
              {actionMsg?.id === msg.id && (
                <div className="message-actions-bar" ref={actionBarRef} style={{ position: 'absolute', [isMine ? 'right' : 'left']: 0, top: -44 }}>
                  <button className="message-action-btn" onClick={() => handleReply(msg)}><IconReply /></button>
                  <button className="message-action-btn" onClick={() => handleCopy(msg.text)}><IconCopy /></button>
                  <button className="message-action-btn danger" onClick={() => handleDeleteMsg(msg.id, isMine)}><IconDelete /></button>
                  {isMine && !msg.image_url && !msg.audio_url && new Date() - new Date(msg.created_at) < 600000 && <button className="message-action-btn" onClick={() => handleEditMsg(msg)}><IconEdit /></button>}
                </div>
              )}
              {isMine && msg.status === 'failed' && !msg.image_url && <button className="message-retry-btn" onClick={() => retryMessage(msg.id, msg.text)}>Retry</button>}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {fullScreenImage && <div className="fullscreen-image-overlay" onClick={() => setFullScreenImage(null)}><button className="fullscreen-close-btn" onClick={() => setFullScreenImage(null)}>✕</button><img src={fullScreenImage} alt="" className="fullscreen-image" /></div>}

      {replyingTo && (
        <div className="reply-preview">
          <div className="reply-preview-text">
            <div className="reply-preview-name">Replying to {replyingTo.sender_id === currentUserId ? 'yourself' : (otherUser?.full_name || 'User')}</div>
            <div className="reply-preview-msg">{replyingTo.text || (replyingTo.image_url ? 'Photo' : 'Voice message')}</div>
          </div>
          <button className="reply-preview-close" onClick={() => setReplyingTo(null)}>✕</button>
        </div>
      )}

      {isRecording ? (
        <div className="voice-recording-bar">
          <div className="recording-dot"></div>
          <span className="recording-timer">0:{recordingTime < 10 ? '0' : ''}{recordingTime}</span>
          <span className="recording-hint">Release to send, slide to cancel</span>
          <button onClick={stopRecording} style={{ background: '#ff3b30', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Send</button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="chat-input-bar">
          <button type="button" className="chat-photo-btn" onClick={() => fileInputRef.current?.click()}><IconAddPhoto /></button>
          <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." className="chat-input" />
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
          {newMessage.trim() ? (
            <button type="submit" className="chat-send-btn"><IconSend /></button>
          ) : (
            <button type="button" className={`chat-mic-btn ${isRecording ? 'recording' : ''}`} onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}><IconMic /></button>
          )}
        </form>
      )}
    </div>
  );
}

export default ChatScreen;
