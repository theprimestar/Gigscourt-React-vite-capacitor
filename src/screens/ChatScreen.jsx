import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL } from '../lib/config';
import { imagekitPublicKey } from '../lib/imagekit';
import { getGigForChannel, registerGig, cancelGig, submitReview, checkExpiredGigs, shouldSendReminder, updateReminderSent } from '../gigSystem';
import '../Chat.css';

const MSG_CACHE_PREFIX = 'gigscourt_msgs_';
const PROFILE_CACHE_PREFIX = 'gigscourt_profile_';

function getCached(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function setCached(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const IconBack = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const IconAvatar = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
  </svg>
);
const IconPhoto = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <polygon points="6 3 20 12 6 21 6 3"/>
  </svg>
);
const IconPause = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/>
  </svg>
);

export default function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  const msgCacheKey = MSG_CACHE_PREFIX + (chatId || otherUserId);
  const profileCacheKey = PROFILE_CACHE_PREFIX + otherUserId;

  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(() => getCached(profileCacheKey) || null);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [gig, setGig] = useState(null);
  const [gigLoading, setGigLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
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
  const [initDone, setInitDone] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  const chatContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const typingChannelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const bannerDismissedByRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingSendTimerRef = useRef(null);
  const isMounted = useRef(true);
  const initRan = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible && !initRan.current) {
      initRan.current = true;
      init();
    }
    return () => {
      isMounted.current = false;
      stopAudio();
      stopRecording();
    };
  }, [chatId, otherUserId, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      initRan.current = false;
      cleanupChannels();
    }
  }, [isVisible]);

  const cleanupChannels = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (typingChannelRef.current) {
      typingChannelRef.current.unsubscribe();
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
  };

  const init = async () => {
    setError(null);
    seenIds.current = new Set();
    setGigLoading(true);
    setInitDone(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;

      setCurrentUserId(user.id);

      const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      if (isMounted.current && myProfile) {
        setCurrentUserName(myProfile.full_name || '');
      }

      const channelKey = chatId || [user.id, otherUserId].sort().join(':');
      channelIdRef.current = channelKey;

      await supabase.rpc('reset_unread', { p_user_id: user.id, p_channel_id: channelKey });
      await checkExpiredGigs(user.id);

      const currentGig = await getGigForChannel(channelKey);
      if (isMounted.current) {
        setGig(currentGig);
        setGigLoading(false);
      }

      const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at, banner_dismissed_by').eq('id', channelKey).single();
      if (isMounted.current && channelData) {
        if (channelData.banner_dismissed_at && channelData.banner_dismissed_by === user.id) {
          setBannerDismissed(true);
          bannerDismissedByRef.current = user.id;
        } else {
          setBannerDismissed(false);
          bannerDismissedByRef.current = null;
        }
      }

      const { data: profile } = await supabase.from('profiles').select('full_name, profile_pic_url, id, onesignal_player_id').eq('id', otherUserId).single();
      if (isMounted.current && profile) {
        setCached(profileCacheKey, profile);
        setOtherUser(profile);
      } else if (isMounted.current) {
        setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
      }

      await loadMessages(channelKey, user.id);
      subscribeToChannel(channelKey);
      subscribeToTyping(channelKey);
      if (isMounted.current) setInitDone(true);
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
        setGigLoading(false);
        setInitDone(true);
      }
    }
  };

  const loadMessages = async (channelId, userId) => {
    const { data: history } = await supabase.rpc('get_messages', {
      p_channel_id: channelId,
      p_user_id: userId,
      p_limit: 50,
      p_cursor: null,
      p_cursor_id: null,
    });

    if (isMounted.current && history) {
      const sorted = [...history].reverse();
      sorted.forEach(m => seenIds.current.add(m.id));
      setMessages(sorted);
      setCached(msgCacheKey, sorted);
      setTimeout(scrollToBottom, 100);
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  const subscribeToChannel = (channelId) => {
    cleanupChannels();
    channelRef.current = supabase.channel(`chat:${channelId}`, {
      config: { broadcast: { self: true, ack: true } },
    });
    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      if (!isMounted.current) return;
      const msg = payload?.payload;
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => {
        const updated = [...prev, msg];
        setCached(msgCacheKey, updated);
        return updated;
      });
      scrollToBottom();
    });
    channelRef.current.subscribe();
  };

  const subscribeToTyping = (channelId) => {
    typingChannelRef.current = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false, ack: true } },
    });
    typingChannelRef.current.on('broadcast', { event: 'typing' }, () => {
      if (!isMounted.current) return;
      setOtherTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (isMounted.current) setOtherTyping(false);
      }, 3000);
    });
    typingChannelRef.current.subscribe();
  };

  const sendTypingIndicator = useCallback(() => {
    if (!channelIdRef.current || !currentUserId) return;
    if (typingSendTimerRef.current) clearTimeout(typingSendTimerRef.current);
    typingSendTimerRef.current = setTimeout(() => {}, 2000);
    const ch = supabase.channel(`typing:${channelIdRef.current}`);
    ch.send({ type: 'broadcast', event: 'typing', payload: {} });
  }, [currentUserId]);

  const sendTextMessage = async (text, tempId) => {
    const channelKey = channelIdRef.current;
    try {
      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', {
        p_channel_key: channelKey,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: text,
      });
      if (sendError || !savedMessage) throw new Error(sendError?.message || 'Failed to send');

      setMessages(prev => {
        const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: savedMessage,
        }).catch(() => {});
      }

      if (otherUser?.onesignal_player_id) {
        fetch(PUSH_NOTIFICATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            include_player_ids: [otherUser.onesignal_player_id],
            headings: { en: currentUserName || 'New message' },
            contents: { en: text },
            data: { channel_id: channelKey },
          }),
        }).catch(() => {});
      }

      await checkBannerReappear();
    } catch (err) {
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;
    const text = newMessage.trim();
    const tempId = 'temp-' + Date.now();
    setNewMessage('');
    const optimistic = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text,
      image_url: null,
      audio_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();
    sendTextMessage(text, tempId);
  };

  const handleRetry = (msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    const tempId = 'temp-' + Date.now();
    const optimistic = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text: msg.text,
      image_url: null,
      audio_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();
    sendTextMessage(msg.text, tempId);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    const tempId = 'temp-photo-' + Date.now();
    const optimistic = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text: '',
      image_url: null,
      audio_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'uploading',
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL);
      const auth = await authRes.json();

      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileName', 'chat-photo.jpg');
      fd.append('folder', '/chat-photos');
      fd.append('useUniqueFileName', 'true');
      fd.append('publicKey', imagekitPublicKey);
      fd.append('token', auth.token);
      fd.append('signature', auth.signature);
      fd.append('expire', auth.expire);

      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: fd,
      });
      const result = await upRes.json();
      if (!upRes.ok) throw new Error(result.message || 'Upload failed');

      const url = result.url + '?tr=f-webp,fo-auto,q-80';

      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', {
        p_channel_key: channelIdRef.current,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: '',
        p_image_url: url,
      });
      if (sendError || !savedMessage) throw new Error('Failed to send photo');

      setMessages(prev => {
        const updated = prev.map(m => (m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: savedMessage,
        }).catch(() => {});
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm', audioBitsPerSecond: 32000 });
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
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const uploadAudio = async (blob) => {
    const tempId = 'temp-audio-' + Date.now();
    const optimistic = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text: '',
      image_url: null,
      audio_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'uploading',
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL);
      const auth = await authRes.json();

      const fd = new FormData();
      fd.append('file', blob, 'voice-message.webm');
      fd.append('fileName', 'voice-message.webm');
      fd.append('folder', '/chat-audio');
      fd.append('useUniqueFileName', 'true');
      fd.append('publicKey', imagekitPublicKey);
      fd.append('token', auth.token);
      fd.append('signature', auth.signature);
      fd.append('expire', auth.expire);

      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: fd,
      });
      const result = await upRes.json();
      if (!upRes.ok) throw new Error(result.message || 'Upload failed');

      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', {
        p_channel_key: channelIdRef.current,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: '',
        p_audio_url: result.url,
      });
      if (sendError || !savedMessage) throw new Error('Failed to send audio');

      setMessages(prev => {
        const updated = prev.map(m => (m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: savedMessage,
        }).catch(() => {});
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingAudio(null);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  };

  const handlePlayAudio = (msg) => {
    if (playingAudio === msg.id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(msg.audio_url);
    audioRef.current = audio;
    setPlayingAudio(msg.id);
    audio.onloadedmetadata = () => {
      if (isMounted.current) setAudioDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      if (isMounted.current) setAudioCurrentTime(audio.currentTime);
    };
    audio.onended = () => {
      if (isMounted.current) {
        setPlayingAudio(null);
        setAudioCurrentTime(0);
      }
    };
    audio.play();
  };

  const formatDuration = (s) => {
    if (!s) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // Gig
  const handleRegisterGig = async () => {
    if (!currentUserId || !otherUserId) return;
    setGigLoading(true);
    try {
      const result = await registerGig(channelIdRef.current, currentUserId, otherUserId);
      if (result?.gig_id) {
        setGig({ id: result.gig_id, status: 'pending_review', provider_id: currentUserId, client_id: otherUserId });
      }
      setBannerDismissed(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGigLoading(false);
    }
  };

  const handleCancelGig = async () => {
    if (!gig || !currentUserId) return;
    setGigLoading(true);
    try {
      await cancelGig(gig.id, currentUserId);
      setGig(null);
      setBannerDismissed(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGigLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!gig || !currentUserId || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      await submitReview(gig.id, currentUserId, reviewRating, reviewText);
      setGig(null);
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewText('');
      setBannerDismissed(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDismissBanner = async () => {
    if (gig && gig.status === 'pending_review') return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBannerDismissed(true);
    bannerDismissedByRef.current = user.id;
    await supabase.from('channels').update({
      banner_dismissed_at: new Date().toISOString(),
      banner_dismissed_by: user.id,
    }).eq('id', channelIdRef.current);
  };

  const checkBannerReappear = async () => {
    if (!bannerDismissed || !bannerDismissedByRef.current) return;
    const { data: channelData } = await supabase.from('channels').select('banner_dismissed_at').eq('id', channelIdRef.current).single();
    if (!channelData?.banner_dismissed_at) return;
    const { count } = await supabase.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelIdRef.current)
      .gt('created_at', channelData.banner_dismissed_at);
    if (count >= 8) {
      await supabase.from('channels').update({
        banner_dismissed_at: null,
        banner_dismissed_by: null,
      }).eq('id', channelIdRef.current);
      setBannerDismissed(false);
      bannerDismissedByRef.current = null;
    }
  };

  const getBannerText = () => {
    const name = otherUser?.full_name || otherUserName || 'this person';
    if (!gig) return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
    if (gig.status === 'pending_review') {
      return currentUserId === gig.provider_id
        ? `Waiting for ${name} to submit their review.`
        : `Please submit your rating and review for ${name}. Tap Pending Gig above.`;
    }
    return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
  };

  const isBannerDismissible = !gig || gig.status !== 'pending_review';
  const showBanner = gig ? true : !bannerDismissed;
  const bannerText = getBannerText();

  const getGigButtonLabel = () => {
    if (gigLoading) return '...';
    if (!gig) return 'Register Gig';
    if (gig.status === 'pending_review') {
      return currentUserId === gig.provider_id ? 'Cancel Gig' : 'Pending Gig';
    }
    return 'Register Gig';
  };

  const handleGigButtonClick = () => {
    if (!gig) handleRegisterGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.provider_id) handleCancelGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.client_id) setShowReviewForm(true);
  };

  // Date helpers
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const days = Math.floor((now - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const shouldShowDateSeparator = (msg, prevMsg) => {
    if (!prevMsg) return true;
    return new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
  };

  const updateFloatingDate = useCallback(() => {
    if (!chatContainerRef.current) return;
    const scrollTop = chatContainerRef.current.scrollTop;
    let currentDate = '';
    const els = chatContainerRef.current.querySelectorAll('[data-date]');
    els.forEach(el => {
      if (el.offsetTop > scrollTop && !currentDate) {
        currentDate = el.getAttribute('data-date');
      }
    });
    setFloatingDate(currentDate);
  }, []);

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Don't render messages until we know who the user is
  const readyToRender = initDone && currentUserId;

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className={`chat-header ${scrolled ? 'scrolled' : ''}`}>
        <button onClick={onBack} className="chat-back-btn" aria-label="Back">
          <IconBack />
        </button>
        <div
          className="chat-header-info"
          onClick={() => otherUser?.id && onViewProfile?.({ id: otherUser.id, full_name: otherUser.full_name })}
        >
          <div className="chat-header-avatar">
            {otherUser?.profile_pic_url ? (
              <img src={otherUser.profile_pic_url} alt="" />
            ) : (
              <div className="chat-avatar-placeholder"><IconAvatar /></div>
            )}
          </div>
          <div>
            <h3>{otherUser?.full_name || otherUserName || 'User'}</h3>
            {otherTyping && <span className="chat-header-typing">typing...</span>}
          </div>
        </div>
        <button
          onClick={handleGigButtonClick}
          className="chat-gig-btn"
          disabled={gigLoading}
        >
          {getGigButtonLabel()}
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="chat-error-toast" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>×</button>
        </div>
      )}

      {/* Gig Banner */}
      {showBanner && bannerText && (
        <div className={`gig-banner ${!isBannerDismissible ? 'gig-banner-locked' : ''}`}>
          <div className="gig-banner-inner">
            <p>{bannerText}</p>
            <p>{bannerText}</p>
          </div>
          {isBannerDismissible && (
            <button onClick={handleDismissBanner} className="gig-banner-dismiss">×</button>
          )}
        </div>
      )}

      {/* Floating date */}
      {floatingDate && (
        <div className="floating-date">
          <span>{floatingDate}</span>
        </div>
      )}

      {/* Messages */}
      <div
  className="chat-messages"
  ref={chatContainerRef}
  onScroll={(e) => {
    updateFloatingDate();
    setScrolled(e.target.scrollTop > 20);
  }}
>
        {!readyToRender && (
          <div className="chat-loading">
            <div className="chat-spinner" />
          </div>
        )}

        {readyToRender && messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet. Say hello!</p>
          </div>
        )}

        {readyToRender && messages.map((msg, i) => {
          const isMine = msg.sender_id === currentUserId;
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const isPlayingThis = playingAudio === msg.id;
          const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;

          return (
            <React.Fragment key={msg.id}>
              {shouldShowDateSeparator(msg, prevMsg) && (
                <div className="date-separator" data-date={formatDate(msg.created_at)}>
                  <span>{formatDate(msg.created_at)}</span>
                </div>
              )}
              <div className={`message-row ${isMine ? 'message-mine' : 'message-theirs'}`}>
                <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${msg.status === 'failed' ? 'bubble-failed' : ''}`}>
                  {msg.audio_url ? (
                    <div className="voice-message">
                      <button className="voice-play-btn" onClick={() => handlePlayAudio(msg)}>
                        {isPlayingThis ? <IconPause /> : <IconPlay />}
                      </button>
                      <div className="voice-progress">
                        <div className="voice-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="voice-time">{isPlayingThis ? formatDuration(audioDuration - audioCurrentTime) : ''}</span>
                    </div>
                  ) : msg.image_url ? (
                    <img
                      src={msg.image_url}
                      alt=""
                      className="message-photo"
                      onClick={() => setFullScreenImage(msg.image_url)}
                      loading="lazy"
                    />
                  ) : (
                    <p className="message-text">{msg.text}</p>
                  )}
                  <span className="message-time">
                    {formatTime(msg.created_at)}
                    {isMine && msg.status === 'sending' && ' · Sending...'}
                    {isMine && msg.status === 'uploading' && ' · Uploading...'}
                    {isMine && msg.status === 'sent' && ' · Sent'}
                    {isMine && msg.is_read && ' · Read'}
                  </span>
                </div>
                {msg.status === 'failed' && (
                  <button className="message-retry" onClick={() => handleRetry(msg)}>
                    Retry
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {readyToRender && otherTyping && (
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Full screen image */}
      {fullScreenImage && (
        <div className="fullscreen-overlay" onClick={() => setFullScreenImage(null)}>
          <button className="fullscreen-close" onClick={() => setFullScreenImage(null)}>×</button>
          <img src={fullScreenImage} alt="" className="fullscreen-image" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Input area */}
      {isRecording ? (
        <div className="recording-bar">
          <div className="recording-dot" />
          <span className="recording-time">0:{recordingTime < 10 ? '0' : ''}{recordingTime}</span>
          <button onClick={cancelRecording} className="recording-cancel">Cancel</button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="chat-input-bar">
          <button type="button" className="chat-input-btn" onClick={() => fileInputRef.current?.click()} aria-label="Add photo">
            <IconPhoto />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); sendTypingIndicator(); }}
            placeholder="Message..."
            className="chat-input"
            autoComplete="off"
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />
          {newMessage.trim() ? (
            <button type="submit" className="chat-input-btn chat-send-btn" aria-label="Send">
              <IconSend />
            </button>
          ) : (
            <button type="button" className="chat-input-btn" onClick={startRecording} aria-label="Record voice message">
              <IconMic />
            </button>
          )}
        </form>
      )}

      {/* Review sheet */}
      {showReviewForm && (
        <div className="bottom-sheet-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-content">
              <h2>Rate your experience</h2>
              <p>How was your gig with {otherUser?.full_name || otherUserName || 'the provider'}?</p>
              <div className="star-selector">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    className={`star-btn ${s <= reviewRating ? 'active' : ''}`}
                    onClick={() => setReviewRating(s)}
                  >
                    {s <= reviewRating ? '★' : '☆'}
                  </button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Write your review (optional)..."
                className="review-textarea"
                rows={3}
              />
              <button
                onClick={handleSubmitReview}
                disabled={reviewRating === 0 || submittingReview}
                className="review-submit-btn"
              >
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
