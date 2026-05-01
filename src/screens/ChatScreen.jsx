import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL } from '../lib/config';
import { imagekitPublicKey } from '../lib/imagekit';
import { getGigForChannel, registerGig, cancelGig, submitReview, checkExpiredGigs, shouldSendReminder, updateReminderSent } from '../gigSystem';
import { Haptics } from '@capacitor/haptics';
import '../Chat.css';

// ── Cache ──
const MSG_CACHE_PREFIX = 'gigscourt_msgs_';
const PROFILE_CACHE_PREFIX = 'gigscourt_profile_';
function getCached(k) { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : null; } catch { return null; } }
function setCached(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ── Icons ──
const IconBack = () => (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>);
const IconAvatar = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>);
const IconReply = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>);
const IconCopy = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>);
const IconDelete = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>);
const IconEdit = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const IconAddPhoto = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);
const IconMic = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>);
const IconSend = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>);
const IconPlay = () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>);
const IconPause = () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>);

export default function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  // ── State ──
  const msgCacheKey = MSG_CACHE_PREFIX + (chatId || otherUserId);
  const profileCacheKey = PROFILE_CACHE_PREFIX + otherUserId;
  const [messages, setMessages] = useState(() => getCached(msgCacheKey) || []);
  const [otherUser, setOtherUser] = useState(() => getCached(profileCacheKey) || null);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [gig, setGig] = useState(null);
  const [gigCheckRunning, setGigCheckRunning] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [actionMsg, setActionMsg] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [floatingDate, setFloatingDate] = useState('');

  // ── Refs ──
  const chatContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const typingChannelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);
  const bannerDismissedByRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingSendTimerRef = useRef(null);

  // ── Init ──
  useEffect(() => {
    isMounted.current = true;
    if (isVisible) init();
    return () => { isMounted.current = false; stopAudio(); stopRecording(); };
  }, [chatId, otherUserId, isVisible]);

  const init = async () => {
    setError(null); seenIds.current = new Set(); setGigCheckRunning(true);
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
      if (isMounted.current) { setGig(currentGig); setGigCheckRunning(false); }
      const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at, banner_dismissed_by').eq('id', channelKey).single();
      if (isMounted.current && channelData) {
        if (channelData.banner_dismissed_at && channelData.banner_dismissed_by === user.id) { setBannerDismissed(true); bannerDismissedByRef.current = user.id; }
        else { setBannerDismissed(false); bannerDismissedByRef.current = null; }
      }
      const { data: profile } = await supabase.from('profiles').select('full_name, profile_pic_url, id, onesignal_player_id').eq('id', otherUserId).single();
      if (isMounted.current && profile) { setCached(profileCacheKey, profile); setOtherUser(profile); }
      else if (isMounted.current) setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
      await loadMessages(channelKey, user.id);
      subscribeToChannel(channelKey);
      subscribeToTyping(channelKey);
    } catch (err) { if (isMounted.current) { setError(err.message); setGigCheckRunning(false); } }
  };

  // ── Messages ──
  const loadMessages = async (channelId, userId) => {
    const { data: history } = await supabase.rpc('get_messages', { p_channel_id: channelId, p_user_id: userId, p_limit: 50, p_cursor: null, p_cursor_id: null });
    if (isMounted.current && history) {
      const sorted = [...history].reverse().map(m => ({ ...m, status: m.sender_id === userId ? (m.is_read ? 'read' : 'sent') : undefined }));
      sorted.forEach(m => seenIds.current.add(m.id));
      setMessages(sorted);
      setCached(msgCacheKey, sorted);
      setTimeout(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }, 100);
    }
  };

  const scrollToBottom = () => { setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); };

  // ── Real-time ──
  const subscribeToChannel = channelId => {
    if (channelRef.current) { channelRef.current.unsubscribe(); supabase.removeChannel(channelRef.current); }
    channelRef.current = supabase.channel(`chat:${channelId}`, { config: { broadcast: { self: true, ack: true } } });
    channelRef.current.on('broadcast', { event: 'message' }, payload => {
      if (!isMounted.current) return;
      const msg = payload?.payload;
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => { const updated = [...prev, { ...msg, status: 'sent' }]; setCached(msgCacheKey, updated); return updated; });
      scrollToBottom();
    });
    channelRef.current.subscribe();
  };

  const subscribeToTyping = channelId => {
    if (typingChannelRef.current) { typingChannelRef.current.unsubscribe(); supabase.removeChannel(typingChannelRef.current); }
    typingChannelRef.current = supabase.channel(`typing:${channelId}`, { config: { broadcast: { self: false, ack: true } } });
    typingChannelRef.current.on('broadcast', { event: 'typing' }, () => {
      if (!isMounted.current) return;
      setOtherTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { if (isMounted.current) setOtherTyping(false); }, 3000);
    });
    typingChannelRef.current.subscribe();
  };

  const sendTypingIndicator = useCallback(() => {
    if (!channelIdRef.current || !currentUserId) return;
    if (typingSendTimerRef.current) clearTimeout(typingSendTimerRef.current);
    typingSendTimerRef.current = setTimeout(() => {}, 2000);
    const channel = supabase.channel(`typing:${channelIdRef.current}`);
    channel.send({ type: 'broadcast', event: 'typing', payload: {} });
  }, [currentUserId]);

  // ── Send ──
  const sendTextMessage = async (text, tempId, replyToId = null) => {
    const channelKey = channelIdRef.current;
    try {
      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', { p_channel_key: channelKey, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: text });
      if (sendError || !savedMessage) throw new Error(sendError?.message || 'Failed');
      if (replyToId) await supabase.from('messages').update({ reply_to_id: replyToId }).eq('id', savedMessage.id);
      setMessages(prev => { const updated = prev.map(m => m.id === tempId ? { ...savedMessage, reply_to_id: replyToId, status: 'sent' } : m); setCached(msgCacheKey, updated); return updated; });
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
      if (otherUser?.onesignal_player_id) fetch(PUSH_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: currentUserName || 'New message' }, contents: { en: text }, data: { channel_id: channelKey } }) }).catch(() => {});
      await checkBannerReappear();
    } catch (err) { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)); }
  };

  const handleSend = e => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;
    const text = newMessage.trim();
    const tempId = 'temp-' + Date.now();
    const replyToId = replyingTo?.id || null;
    setNewMessage(''); setReplyingTo(null);
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text, image_url: null, created_at: new Date().toISOString(), is_read: false, status: 'sending', reply_to_id: replyToId }]);
    scrollToBottom();
    sendTextMessage(text, tempId, replyToId);
  };

  // ── Photo ──
  const handlePhotoUpload = async e => {
    const file = e.target.files?.[0]; if (!file || !currentUserId) return;
    const tempId = 'temp-photo-' + Date.now();
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' }]);
    scrollToBottom(); if (fileInputRef.current) fileInputRef.current.value = '';
    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
      const fd = new FormData(); fd.append('file', file); fd.append('fileName', 'chat-photo.jpg'); fd.append('folder', '/chat-photos'); fd.append('useUniqueFileName', 'true'); fd.append('publicKey', imagekitPublicKey); fd.append('token', auth.token); fd.append('signature', auth.signature); fd.append('expire', auth.expire);
      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd }); const result = await upRes.json();
      if (!upRes.ok) throw new Error(result.message || 'Upload failed');
      const url = result.url + '?tr=f-webp,fo-auto,q-80';
      const { data: savedMessage } = await supabase.rpc('send_message', { p_channel_key: channelIdRef.current, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_image_url: url });
      if (!savedMessage) throw new Error('Failed');
      setMessages(prev => { const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m); setCached(msgCacheKey, updated); return updated; });
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    } catch (err) { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)); }
  };

  // ── Voice ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm', audioBitsPerSecond: 32000 });
      const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => { const blob = new Blob(chunks, { type: 'audio/webm' }); await uploadAudio(blob); stream.getTracks().forEach(t => t.stop()); };
      mediaRecorderRef.current = recorder; recorder.start();
      setIsRecording(true); setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => { setRecordingTime(prev => { if (prev >= 59) { stopRecording(); return 60; } return prev + 1; }); }, 1000);
    } catch (err) { setError('Microphone access denied'); }
  };
  const stopRecording = () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop(); setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  const cancelRecording = () => { if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); } setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  const uploadAudio = async blob => {
    const tempId = 'temp-audio-' + Date.now();
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' }]);
    scrollToBottom();
    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
      const fd = new FormData(); fd.append('file', blob, 'voice-message.webm'); fd.append('fileName', 'voice-message.webm'); fd.append('folder', '/chat-audio'); fd.append('useUniqueFileName', 'true'); fd.append('publicKey', imagekitPublicKey); fd.append('token', auth.token); fd.append('signature', auth.signature); fd.append('expire', auth.expire);
      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd }); const result = await upRes.json();
      if (!upRes.ok) throw new Error(result.message || 'Upload failed');
      const { data: savedMessage } = await supabase.rpc('send_message', { p_channel_key: channelIdRef.current, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_audio_url: result.url });
      if (!savedMessage) throw new Error('Failed');
      setMessages(prev => { const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m); setCached(msgCacheKey, updated); return updated; });
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    } catch (err) { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)); }
  };

  // ── Audio Playback ──
  const stopAudio = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setPlayingAudio(null); setAudioCurrentTime(0); setAudioDuration(0); };
  const handlePlayAudio = msg => {
    if (playingAudio === msg.id) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio(msg.audio_url); audioRef.current = audio; setPlayingAudio(msg.id);
    audio.onloadedmetadata = () => { if (isMounted.current) setAudioDuration(audio.duration); };
    audio.ontimeupdate = () => { if (isMounted.current) setAudioCurrentTime(audio.currentTime); };
    audio.onended = () => { if (isMounted.current) { setPlayingAudio(null); setAudioCurrentTime(0); } };
    audio.play();
  };
  const formatDuration = s => { if (!s) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; };

  // ── Long Press Message ──
  const triggerHaptic = async () => { try { await Haptics.impact({ style: 'MEDIUM' }); } catch {} };
  const handleMsgLongPress = async (e, msg) => { e.preventDefault(); await triggerHaptic(); setActionMsg(actionMsg?.id === msg.id ? null : msg); setEditingMsg(null); };
  const handleReply = msg => { setReplyingTo(msg); setActionMsg(null); };
  const handleCopy = text => { navigator.clipboard.writeText(text).then(() => setActionMsg(null)).catch(() => {}); };
  const handleDeleteMsg = async (msgId, isMine) => {
    setActionMsg(null);
    if (isMine) {
      await supabase.from('messages').update({ deleted_by_sender: true }).eq('id', msgId);
      setMessages(prev => { const updated = prev.map(m => m.id === msgId ? { ...m, deleted_by_sender: true } : m); setCached(msgCacheKey, updated); return updated; });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.rpc('hide_message', { p_message_id: msgId, p_user_id: user.id });
      setMessages(prev => { const updated = prev.filter(m => m.id !== msgId); setCached(msgCacheKey, updated); return updated; });
    }
  };
  const handleEditMsg = msg => { setEditingMsg(msg); setEditText(msg.text); setActionMsg(null); };
  const submitEdit = async () => {
    if (!editText.trim() || !editingMsg) return;
    await supabase.from('messages').update({ text: editText.trim(), edited_at: new Date().toISOString() }).eq('id', editingMsg.id);
    setMessages(prev => { const updated = prev.map(m => m.id === editingMsg.id ? { ...m, text: editText.trim(), edited_at: new Date().toISOString() } : m); setCached(msgCacheKey, updated); return updated; });
    setEditingMsg(null); setEditText('');
  };
  const canEdit = msg => msg.sender_id === currentUserId && !msg.image_url && !msg.audio_url && (Date.now() - new Date(msg.created_at).getTime() < 600000);

  // ── Gig ──
  const handleRegisterGig = async () => {
    if (!currentUserId || !otherUserId) return;
    setGigCheckRunning(true);
    try {
      const result = await registerGig(channelIdRef.current, currentUserId, otherUserId);
      if (result?.gig_id) setGig({ id: result.gig_id, status: 'pending_review', provider_id: currentUserId, client_id: otherUserId });
      setBannerDismissed(false);
    } catch (err) { setError(err.message); }
    finally { setGigCheckRunning(false); }
  };
  const handleCancelGig = async () => {
    if (!gig || !currentUserId) return;
    setGigCheckRunning(true);
    try { await cancelGig(gig.id, currentUserId); setGig(null); setBannerDismissed(false); }
    catch (err) { setError(err.message); }
    finally { setGigCheckRunning(false); }
  };
  const handleSubmitReview = async () => {
    if (!gig || !currentUserId || reviewRating === 0) return;
    setSubmittingReview(true);
    try { await submitReview(gig.id, currentUserId, reviewRating, reviewText); setGig(null); setShowReviewForm(false); setReviewRating(0); setReviewText(''); setBannerDismissed(false); }
    catch (err) { setError(err.message); }
    finally { setSubmittingReview(false); }
  };
  const handleDismissBanner = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBannerDismissed(true); bannerDismissedByRef.current = user.id;
    await supabase.from('channels').update({ banner_dismissed_at: new Date().toISOString(), banner_dismissed_by: user.id }).eq('id', channelIdRef.current);
  };
  const checkBannerReappear = async () => {
    if (!bannerDismissed || !bannerDismissedByRef.current) return;
    const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at').eq('id', channelIdRef.current).single();
    if (!channelData?.banner_dismissed_at) return;
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('channel_id', channelIdRef.current).gt('created_at', channelData.banner_dismissed_at);
    if (count >= 8) { await supabase.from('channels').update({ banner_dismissed_at: null, banner_dismissed_by: null }).eq('id', channelIdRef.current); setBannerDismissed(false); bannerDismissedByRef.current = null; }
  };
  const checkGigReminder = async currentGig => {
    if (!currentGig || currentGig.status !== 'pending_review' || currentUserId !== currentGig.client_id) return;
    if (shouldSendReminder(currentGig)) {
      if (otherUser?.onesignal_player_id) fetch(PUSH_NOTIFICATION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: 'Reminder' }, contents: { en: `Please rate your experience with ${otherUserName || 'the provider'}` }, data: { channel_id: channelIdRef.current } }) }).catch(() => {});
      await updateReminderSent(currentGig.id);
    }
  };
  const getBannerText = () => {
    const name = otherUser?.full_name || otherUserName || 'this person';
    if (!gig) return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
    if (gig.status === 'pending_review') return currentUserId === gig.provider_id ? `Waiting for ${name} to submit their review.` : `Please submit your rating and review for ${name}. Tap Pending Gig above.`;
    return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
  };
  const getGigButtonLabel = () => {
    if (gigCheckRunning) return '...';
    if (!gig) return 'Register Gig';
    if (gig.status === 'pending_review') return currentUserId === gig.provider_id ? 'Cancel Gig' : 'Pending Gig';
    return 'Register Gig';
  };
  const handleGigButtonClick = () => {
    if (!gig) handleRegisterGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.provider_id) handleCancelGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.client_id) setShowReviewForm(true);
  };

  // ── Date Chip ──
  const updateFloatingDate = useCallback(() => {
    if (!chatContainerRef.current) return;
    const scrollTop = chatContainerRef.current.scrollTop;
    let currentDate = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg.created_at) continue;
      const el = document.getElementById(`msg-${msg.id}`);
      if (el && el.offsetTop > scrollTop) { currentDate = formatDate(msg.created_at); break; }
    }
    if (!currentDate && messages.length > 0) currentDate = formatDate(messages[0]?.created_at);
    setFloatingDate(currentDate);
  }, [messages]);
  const formatDate = ts => {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const days = Math.floor((now - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  const shouldShowDateSeparator = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const d1 = new Date(msg.created_at).toDateString();
    const d2 = new Date(prevMsg.created_at).toDateString();
    return d1 !== d2;
  };

  // ── Helpers ──
  const formatTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const getStatusText = msg => {
    if (msg.sender_id !== currentUserId) return null;
    if (msg.status === 'sending') return <span className="message-status sending">...</span>;
    if (msg.status === 'uploading') return <span className="message-status sending">...</span>;
    if (msg.status === 'sent') return <span className="message-status sent">Sent</span>;
    if (msg.status === 'read') return <span className="message-status read">Read</span>;
    if (msg.status === 'failed') return <button className="message-retry-btn" onClick={() => sendTextMessage(msg.text, msg.id, msg.reply_to_id)}>Retry</button>;
    return null;
  };

  // ── Render ──
  const bannerText = getBannerText();
  const showBanner = !gig ? !bannerDismissed : true;

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn" aria-label="Back"><IconBack /></button>
        <div className="chat-header-info-tappable" onClick={() => otherUser?.id && onViewProfile?.({ id: otherUser.id, full_name: otherUser.full_name })}>
          <div className="chat-header-avatar">{otherUser?.profile_pic_url ? <img src={otherUser.profile_pic_url} alt="" /> : <div className="chat-header-avatar-placeholder"><IconAvatar /></div>}</div>
          <div className="chat-header-info"><h3>{otherUser?.full_name || 'User'}</h3></div>
        </div>
        <button onClick={handleGigButtonClick} className="chat-header-gig-btn" disabled={gigCheckRunning}>{getGigButtonLabel()}</button>
      </div>

      {error && <div className="chat-error-banner" onClick={() => setError(null)}><span>{error}</span><button>✕</button></div>}

      {/* Gig Banner */}
      {showBanner && bannerText && (
        <div className="gig-banner">
          <div className="gig-banner-scroll"><p className="gig-banner-text">{bannerText}</p><p className="gig-banner-text">{bannerText}</p></div>
          {!gig && <button onClick={handleDismissBanner} className="gig-banner-dismiss">✕</button>}
        </div>
      )}

      {/* Floating Date Chip */}
      {floatingDate && <div className="floating-date-chip"><span>{floatingDate}</span></div>}

      {/* Messages */}
      <div className="chat-messages" ref={chatContainerRef} onScroll={updateFloatingDate}>
        {messages.length === 0 && <div className="chat-empty"><p>No messages yet. Say hello!</p></div>}
        {messages.map((msg, i) => {
          const isMine = msg.sender_id === currentUserId;
          const isDeleted = msg.deleted_by_sender;
          const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
          const isPlayingThis = playingAudio === msg.id;
          const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;
          const isActionTarget = actionMsg?.id === msg.id;
          const prevMsg = i > 0 ? messages[i - 1] : null;
          return (
            <React.Fragment key={msg.id}>
              {shouldShowDateSeparator(msg, prevMsg) && <div className="date-separator"><span>{formatDate(msg.created_at)}</span></div>}
              <div className={`message-row ${isMine ? 'message-mine' : 'message-other'} ${actionMsg && !isActionTarget ? 'message-dimmed' : ''}`} id={`msg-${msg.id}`}>
                <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'} ${isDeleted ? 'bubble-deleted' : ''} ${isActionTarget ? 'bubble-highlighted' : ''}`}
                  onContextMenu={e => handleMsgLongPress(e, msg)}
                  onTouchStart={e => { const t = setTimeout(() => handleMsgLongPress(e, msg), 500); e.target._lp = t; }}
                  onTouchEnd={e => clearTimeout(e.target._lp)}
                  onTouchMove={() => {}}>
                  {isDeleted ? <p className="message-text">This message was deleted</p> : (
                    <>
                      {repliedMsg && <div className="quoted-message"><div className="quoted-name">{repliedMsg.sender_id === currentUserId ? 'You' : otherUser?.full_name || 'User'}</div><div className="quoted-text">{repliedMsg.text || (repliedMsg.image_url ? 'Photo' : 'Voice message')}</div></div>}
                      {msg.audio_url ? (
                        <div className="voice-message">
                          <button className="voice-play-btn" onClick={() => handlePlayAudio(msg)}>{isPlayingThis ? <IconPause /> : <IconPlay />}</button>
                          <div className="voice-progress-bar"><div className="voice-progress-track"><div className="voice-progress-fill" style={{ width: `${progress}%` }} /></div></div>
                          <span className="voice-duration">{isPlayingThis ? formatDuration(audioDuration - audioCurrentTime) : ''}</span>
                        </div>
                      ) : msg.image_url ? (
                        <img src={msg.image_url} alt="" className="chat-photo" onClick={() => setFullScreenImage(msg.image_url)} />
                      ) : editingMsg?.id === msg.id ? (
                        <div className="edit-inline">
                          <input type="text" value={editText} onChange={e => setEditText(e.target.value)} className="edit-inline-input" autoFocus />
                          <button onClick={submitEdit} className="edit-inline-save">Save</button>
                          <button onClick={() => setEditingMsg(null)} className="edit-inline-cancel">✕</button>
                        </div>
                      ) : msg.text ? <p className="message-text">{msg.text}</p> : null}
                    </>
                  )}
                  <span className="message-time">{formatTime(msg.created_at)}{msg.edited_at && !isDeleted ? ' (edited)' : ''}{isMine && getStatusText(msg)}</span>
                </div>
                {isActionTarget && (
                  <div className="message-actions-bar">
                    <button className="message-action-btn" onClick={() => handleReply(msg)} aria-label="Reply"><IconReply /></button>
                    {msg.text && <button className="message-action-btn" onClick={() => handleCopy(msg.text)} aria-label="Copy"><IconCopy /></button>}
                    <button className="message-action-btn danger" onClick={() => handleDeleteMsg(msg.id, isMine)} aria-label="Delete"><IconDelete /></button>
                    {canEdit(msg) && <button className="message-action-btn" onClick={() => handleEditMsg(msg)} aria-label="Edit"><IconEdit /></button>}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {otherTyping && (
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Full Screen Image */}
      {fullScreenImage && (
        <div className="fullscreen-image-overlay" onClick={() => setFullScreenImage(null)}>
          <button className="fullscreen-close-btn" onClick={() => setFullScreenImage(null)}>✕</button>
          <img src={fullScreenImage} alt="" className="fullscreen-image" />
        </div>
      )}

      {/* Reply Preview */}
      {replyingTo && (
        <div className="reply-preview">
          <div className="reply-preview-text"><div className="reply-preview-name">Replying to {replyingTo.sender_id === currentUserId ? 'yourself' : otherUser?.full_name || 'User'}</div><div className="reply-preview-msg">{replyingTo.text || (replyingTo.image_url ? 'Photo' : 'Voice message')}</div></div>
          <button className="reply-preview-close" onClick={() => setReplyingTo(null)}>✕</button>
        </div>
      )}

      {/* Input */}
      {isRecording ? (
        <div className="voice-recording-bar">
          <div className="recording-dot" />
          <span className="recording-timer">0:{recordingTime < 10 ? '0' : ''}{recordingTime}</span>
          <button onClick={cancelRecording} className="recording-cancel-btn">Cancel</button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="chat-input-bar">
          <button type="button" className="chat-photo-btn" onClick={() => fileInputRef.current?.click()} aria-label="Add photo"><IconAddPhoto /></button>
          <input type="text" value={newMessage} onChange={e => { setNewMessage(e.target.value); sendTypingIndicator(); }} placeholder="Type a message..." className="chat-input" />
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
          {newMessage.trim() ? <button type="submit" className="chat-send-btn" aria-label="Send"><IconSend /></button> : <button type="button" className="chat-mic-btn" onClick={startRecording} aria-label="Record"><IconMic /></button>}
        </form>
      )}

      {/* Review Sheet */}
      {showReviewForm && (
        <div className="bottom-sheet-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="bottom-sheet review-sheet" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-content">
              <h2>Rate your experience</h2>
              <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 16 }}>How was your gig with {otherUser?.full_name || otherUserName || 'the provider'}?</p>
              <div className="star-selector">{[1,2,3,4,5].map(s => <button key={s} className={`star-btn ${s <= reviewRating ? 'star-active' : ''}`} onClick={() => setReviewRating(s)}>{s <= reviewRating ? '★' : '☆'}</button>)}</div>
              <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Write your review (optional)..." className="review-textarea" rows={3} />
              <button onClick={handleSubmitReview} disabled={reviewRating === 0 || submittingReview} className="onboarding-btn" style={{ marginTop: 12 }}>{submittingReview ? 'Submitting...' : 'Submit Review'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Long Press Dismiss Overlay */}
      {actionMsg && <div className="chat-list-dismiss-overlay" onClick={() => setActionMsg(null)} />}
    </div>
  );
}
