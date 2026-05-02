import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL } from '../lib/config';
import { imagekitPublicKey } from '../lib/imagekit';
import { getGigForChannel, registerGig, cancelGig, submitReview, checkExpiredGigs } from '../gigSystem';
import '../Chat.css';
import '../ChatUnread.css';
import { UnreadBanner, ScrollToBottomButton } from '../ChatUnread';

const MSG_CACHE_PREFIX = 'gigscourt_msgs_';
const PROFILE_CACHE_PREFIX = 'gigscourt_profile_';
const USER_CACHE_KEY = 'gigscourt_my_id';
const GIG_CACHE_PREFIX = 'gigscourt_gig_';

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
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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

const markMessageRead = (msg, currentUserId, channelIdRef, channelRef) => {
  if (!msg.is_read && msg.sender_id !== currentUserId) {
    supabase.rpc('mark_message_read', {
      p_message_id: msg.id,
      p_channel_id: channelIdRef.current,
      p_user_id: currentUserId,
    }).then(() => {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message_read',
          payload: { message_id: msg.id },
        }).catch(() => {});
      }
    }).catch(() => {});
  }
};

const getPhotoUrl = (url, size) => {
  if (!url) return '';
  const base = url.split('?')[0];
  if (size === 'thumb') return base + '?tr=f-webp,fo-auto,w-600,q-80';
  return base + '?tr=f-webp,fo-auto,w-1200,q-85';
};

export default function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  const msgCacheKey = MSG_CACHE_PREFIX + (chatId || otherUserId);
  const profileCacheKey = PROFILE_CACHE_PREFIX + otherUserId;
  const gigCacheKey = GIG_CACHE_PREFIX + (chatId || otherUserId);

  const cachedMessages = getCached(msgCacheKey) || [];
  const cachedUserId = getCached(USER_CACHE_KEY);
  const cachedGig = getCached(gigCacheKey) || null;

  const [messages, setMessages] = useState(cachedMessages);
  const [otherUser, setOtherUser] = useState(() => getCached(profileCacheKey) || null);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(cachedUserId);
  const [currentUserName, setCurrentUserName] = useState('');
  const [gig, setGig] = useState(cachedGig);
  const [gigLoading, setGigLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioState, setAudioState] = useState({});
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [floatingDate, setFloatingDate] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState(-1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const chatContainerRef = useRef(null);
  const channelRef = useRef(null);
  const typingChannelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set(cachedMessages.map(m => m.id)));
  const bannerDismissedByRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const pausedAudioRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingSendTimerRef = useRef(null);
  const isMounted = useRef(true);
  const initRan = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (gig !== undefined) setCached(gigCacheKey, gig);
  }, [gig]);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible && !initRan.current) {
      initRan.current = true;
      init();
    }
    const handleFocus = () => {
      if (isVisible && isMounted.current && initRan.current && !syncingRef.current) {
        syncFromServer();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isVisible && isMounted.current && initRan.current && !syncingRef.current) {
        syncFromServer();
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibility);
    return () => {
      isMounted.current = false;
      stopAudio();
      stopRecording();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [chatId, otherUserId, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      initRan.current = false;
      cleanupChannels();
    }
  }, [isVisible]);

  const scrollToMessage = (index) => {
    if (!chatContainerRef.current || index < 0) return;
    const el = chatContainerRef.current.querySelector(`[data-msg-index="${index}"]`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  const loadAndScroll = async (lastRead) => {
    if (!channelIdRef.current || !currentUserId) return;
    try {
      const { data: history } = await supabase.rpc('get_messages', {
        p_channel_id: channelIdRef.current,
        p_user_id: currentUserId,
        p_limit: 50,
        p_cursor: null,
        p_cursor_id: null,
      });
      if (isMounted.current && history) {
        const serverMsgs = [...history].reverse();
        serverMsgs.forEach(m => seenIds.current.add(m.id));
        setMessages(serverMsgs);
        setCached(msgCacheKey, serverMsgs);

        if (lastRead) {
          const lastReadTime = new Date(lastRead).getTime();
          const firstUnread = serverMsgs.findIndex(m =>
            m.sender_id !== currentUserId && new Date(m.created_at).getTime() > lastReadTime
          );
          if (firstUnread !== -1) {
            setFirstUnreadIndex(firstUnread);
            const count = serverMsgs.filter((m, i) =>
              i >= firstUnread && m.sender_id !== currentUserId
            ).length;
            setUnreadCount(count);
            setShowUnreadBanner(true);
            setTimeout(() => scrollToMessage(firstUnread), 200);
            return;
          }
        }
        setTimeout(() => scrollToBottom(), 200);
      }
    } catch (err) {
      // silent
    }
  };

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

  const syncFromServer = async () => {
    if (!channelIdRef.current || !currentUserId || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const { data: history } = await supabase.rpc('get_messages', {
        p_channel_id: channelIdRef.current,
        p_user_id: currentUserId,
        p_limit: 50,
        p_cursor: null,
        p_cursor_id: null,
      });
      if (isMounted.current && history) {
        const serverMsgs = [...history].reverse();
        const newMsgs = serverMsgs.filter(m => !seenIds.current.has(m.id));
        if (newMsgs.length > 0) {
          newMsgs.forEach(m => seenIds.current.add(m.id));
        }

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const toAdd = serverMsgs.filter(m => !existingIds.has(m.id));
          
          const serverMap = new Map(serverMsgs.map(m => [m.id, m]));
          const updated = prev.map(m => {
            const sm = serverMap.get(m.id);
            if (sm && sm.is_read && !m.is_read) {
              return { ...m, is_read: true };
            }
            return m;
          });

          const merged = [...updated, ...toAdd];
          setCached(msgCacheKey, merged);
          return merged;
        });
      }

      const currentGig = await getGigForChannel(channelIdRef.current);
      if (isMounted.current) {
        const prevGig = getCached(gigCacheKey);
        if (JSON.stringify(currentGig) !== JSON.stringify(prevGig)) {
          setGig(currentGig);
        }
      }
    } catch (err) {
      // silent
    } finally {
      syncingRef.current = false;
    }
  };

  const init = async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;

      if (!cachedUserId || cachedUserId !== user.id) {
        setCurrentUserId(user.id);
        setCached(USER_CACHE_KEY, user.id);
      }

      const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      if (isMounted.current && myProfile) setCurrentUserName(myProfile.full_name || '');

      const channelKey = chatId || [user.id, otherUserId].sort().join(':');
      channelIdRef.current = channelKey;

      const currentGig = await getGigForChannel(channelKey);
      if (isMounted.current) {
        const prevGig = getCached(gigCacheKey);
        if (JSON.stringify(currentGig) !== JSON.stringify(prevGig)) setGig(currentGig);
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

      subscribeToChannel(channelKey);
      subscribeToTyping(channelKey);

      const { data: memberData } = await supabase
        .from('channel_members')
        .select('last_read_at')
        .eq('channel_id', channelKey)
        .eq('user_id', user.id)
        .single();

      const lastRead = memberData?.last_read_at || null;
      setLastReadAt(lastRead);

      await supabase.rpc('reset_unread', { p_user_id: user.id, p_channel_id: channelKey });
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'bulk_read',
          payload: { channel_id: channelKey, reader_id: user.id },
        }).catch(() => {});
      }
      await checkExpiredGigs(user.id);

      loadAndScroll(lastRead);
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const subscribeToChannel = (channelId) => {
    cleanupChannels();
    channelRef.current = supabase.channel(`chat:${channelId}`, { config: { broadcast: { self: true, ack: true } } });
    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      if (!isMounted.current) return;
      const msg = payload?.payload;
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => {
        const updated = [...prev, msg];
        setCached(msgCacheKey, updated);
        const container = chatContainerRef.current;
        if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          if (isNearBottom || msg.sender_id === currentUserId) {
            setTimeout(() => scrollToBottom(), 50);
          } else {
            setUnreadCount(c => c + 1);
            setShowScrollBtn(true);
          }
        }
        return updated;
      });
    });
    channelRef.current.on('broadcast', { event: 'gig_update' }, async () => {
      if (!isMounted.current || !channelIdRef.current) return;
      const currentGig = await getGigForChannel(channelIdRef.current);
      if (isMounted.current) setGig(currentGig);
    });
    channelRef.current.on('broadcast', { event: 'message_read' }, (payload) => {
      if (!isMounted.current) return;
      const messageId = payload?.payload?.message_id;
      if (!messageId) return;
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, is_read: true } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
    });
    channelRef.current.on('broadcast', { event: 'bulk_read' }, (payload) => {
      if (!isMounted.current) return;
      const { reader_id } = payload?.payload || {};
      setMessages(prev => {
        const updated = prev.map(m => m.sender_id !== reader_id ? { ...m, is_read: true } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
    });
    channelRef.current.subscribe();
  };

  const broadcastGigUpdate = () => {
    if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'gig_update', payload: {} }).catch(() => {});
  };

  const subscribeToTyping = (channelId) => {
    typingChannelRef.current = supabase.channel(`typing:${channelId}`, { config: { broadcast: { self: false, ack: true } } });
    typingChannelRef.current.on('broadcast', { event: 'typing' }, () => {
      if (!isMounted.current) return;
      setOtherTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { if (isMounted.current) setOtherTyping(false); }, 3000);
    });
    typingChannelRef.current.on('broadcast', { event: 'typing_stop' }, () => {
      if (!isMounted.current) return;
      setOtherTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    });
    typingChannelRef.current.subscribe();
  };

  const sendTypingIndicator = useCallback(() => {
    if (!channelIdRef.current || !currentUserId) return;
    if (typingSendTimerRef.current) clearTimeout(typingSendTimerRef.current);
    const ch = supabase.channel(`typing:${channelIdRef.current}`);
    ch.send({ type: 'broadcast', event: 'typing', payload: {} });
    typingSendTimerRef.current = setTimeout(() => {}, 2000);
  }, [currentUserId]);

  const getStatusText = (msg) => {
    if (msg.status === 'sending' || msg.status === 'uploading') return ' · · ·';
    if (msg.is_read) {
      if (msg.image_url) return ' · Viewed';
      if (msg.audio_url) return ' · Played';
      return ' · Read';
    }
    if (msg.status === 'sent') {
      if (msg.image_url) return ' · Sent';
      if (msg.audio_url) return ' · Sent';
      return ' · Sent';
    }
    return '';
  };

  const sendTextMessage = async (text, tempId) => {
    try {
      const { data: savedMessage, error: rpcError } = await supabase.rpc('send_message', {
        p_channel_key: channelIdRef.current, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: text,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!savedMessage?.id) throw new Error('No message returned');

      setMessages(prev => {
        const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);

      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
      if (otherUser?.onesignal_player_id) {
        fetch(PUSH_NOTIFICATION_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_player_ids: [otherUser.onesignal_player_id], headings: { en: currentUserName || 'New message' }, contents: { en: text }, data: { channel_id: channelIdRef.current } }),
        }).catch(() => {});
      }
      await checkBannerReappear();
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;
    const text = newMessage.trim();
    const tempId = 'temp-' + Date.now();
    setNewMessage('');
    if (typingChannelRef.current) {
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing_stop', payload: {} });
    }
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text, image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'sending' }]);
    sendTextMessage(text, tempId);
  };

  const handleRetry = (msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    const tempId = 'temp-' + Date.now();
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: msg.text, image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'sending' }]);
    sendTextMessage(msg.text, tempId);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;
    const tempId = 'temp-photo-' + Date.now();
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' }]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
      const fd = new FormData();
      fd.append('file', file); fd.append('fileName', 'chat-photo.jpg'); fd.append('folder', '/chat-photos'); fd.append('useUniqueFileName', 'true'); fd.append('publicKey', imagekitPublicKey); fd.append('token', auth.token); fd.append('signature', auth.signature); fd.append('expire', auth.expire);
      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd });
      const uploadResult = await upRes.json();
      if (!upRes.ok) throw new Error(uploadResult.message || 'Upload failed');
      const url = getPhotoUrl(uploadResult.url, 'thumb');

      const { data: savedMessage, error: rpcError } = await supabase.rpc('send_message', {
        p_channel_key: channelIdRef.current, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_image_url: url,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!savedMessage?.id) throw new Error('Failed to send photo');

      setMessages(prev => {
        const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        await uploadAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => { if (prev >= 59) { stopRecording(); return 60; } return prev + 1; });
      }, 1000);
    } catch { setError('Microphone access denied'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
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
    setMessages(prev => [...prev, { id: tempId, channel_id: channelIdRef.current, sender_id: currentUserId, text: '', image_url: null, audio_url: null, created_at: new Date().toISOString(), is_read: false, status: 'uploading' }]);

    try {
      const authRes = await fetch(IMAGEKIT_AUTH_URL); const auth = await authRes.json();
      const fd = new FormData();
      fd.append('file', blob, 'voice-message'); fd.append('fileName', 'voice-message'); fd.append('folder', '/chat-audio'); fd.append('useUniqueFileName', 'true'); fd.append('publicKey', imagekitPublicKey); fd.append('token', auth.token); fd.append('signature', auth.signature); fd.append('expire', auth.expire);
      const upRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd });
      const uploadResult = await upRes.json();
      if (!upRes.ok) throw new Error(uploadResult.message || 'Upload failed');

      const { data: savedMessage, error: rpcError } = await supabase.rpc('send_message', {
        p_channel_key: channelIdRef.current, p_sender_id: currentUserId, p_other_user_id: otherUserId, p_text: '', p_audio_url: uploadResult.url,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!savedMessage?.id) throw new Error('Failed to send audio');

      setMessages(prev => {
        const updated = prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m);
        setCached(msgCacheKey, updated);
        return updated;
      });
      seenIds.current.add(savedMessage.id);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'message', payload: savedMessage }).catch(() => {});
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingAudio(null);
  };

  const handlePlayAudio = (msg) => {
    markMessageRead(msg, currentUserId, channelIdRef, channelRef);

    if (playingAudio === msg.id) {
      audioRef.current?.pause();
      setAudioState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], currentTime: audioRef.current?.currentTime || 0, playing: false } }));
      pausedAudioRef.current = audioRef.current;
      audioRef.current = null;
      setPlayingAudio(null);
      return;
    }

    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    if (pausedAudioRef.current && pausedAudioRef.current.src === msg.audio_url) {
      audioRef.current = pausedAudioRef.current;
      pausedAudioRef.current = null;
      audioRef.current.play();
      setPlayingAudio(msg.id);
      setAudioState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], playing: true } }));
      return;
    }

    stopAudio();
    const startFrom = audioState[msg.id]?.currentTime || 0;
    const audio = new Audio(msg.audio_url);
    audioRef.current = audio;
    audio.currentTime = startFrom;
    setPlayingAudio(msg.id);

    audio.onloadedmetadata = () => {
      if (isMounted.current) setAudioState(prev => ({ ...prev, [msg.id]: { duration: audio.duration, currentTime: startFrom, playing: true } }));
    };
    audio.ontimeupdate = () => {
      if (isMounted.current && !isSeeking) setAudioState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], currentTime: audio.currentTime, duration: audio.duration, playing: true } }));
    };
    audio.onended = () => {
      if (isMounted.current) {
        setPlayingAudio(null);
        setAudioState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], currentTime: 0, playing: false } }));
      }
    };
    audio.play();
  };

  const seekTo = (msg, clientX) => {
    const bar = document.getElementById(`voice-bar-${msg.id}`);
    if (!bar || !audioRef.current || playingAudio !== msg.id) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = audioState[msg.id]?.duration || audioRef.current.duration || 0;
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setAudioState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], currentTime: newTime } }));
  };

  const handleSeekStart = (msg, e) => { e.preventDefault(); e.stopPropagation(); setIsSeeking(true); seekTo(msg, e.touches ? e.touches[0].clientX : e.clientX); };
  const handleSeekMove = (msg, e) => { if (!isSeeking) return; e.preventDefault(); e.stopPropagation(); seekTo(msg, e.touches ? e.touches[0].clientX : e.clientX); };
  const handleSeekEnd = () => { setIsSeeking(false); };

  useEffect(() => {
    if (!isSeeking) return;
    const up = () => setIsSeeking(false);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); };
  }, [isSeeking]);

  const formatDuration = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleRegisterGig = async () => {
    if (!currentUserId || !otherUserId) return;
    setGigLoading(true);
    try {
      const result = await registerGig(channelIdRef.current, currentUserId, otherUserId);
      if (result?.gig_id) {
        setGig({ id: result.gig_id, status: 'pending_review', provider_id: currentUserId, client_id: otherUserId });
        broadcastGigUpdate();
      }
      setBannerDismissed(false);
    } catch (err) { setError(err.message); }
    finally { setGigLoading(false); }
  };

  const handleCancelGig = async () => {
    if (!gig || !currentUserId) return;
    setGigLoading(true);
    try {
      await cancelGig(gig.id, currentUserId);
      setGig(null);
      setBannerDismissed(false);
      broadcastGigUpdate();
    } catch (err) { setError(err.message); }
    finally { setGigLoading(false); }
  };

  const handleSubmitReview = async () => {
    if (!gig || !currentUserId || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      await submitReview(gig.id, currentUserId, reviewRating, reviewText);
      setGig(null); setShowReviewForm(false); setReviewRating(0); setReviewText(''); setBannerDismissed(false);
      broadcastGigUpdate();
    } catch (err) { setError(err.message); }
    finally { setSubmittingReview(false); }
  };

  const handleDismissBanner = async () => {
    if (gig && gig.status === 'pending_review') return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBannerDismissed(true); bannerDismissedByRef.current = user.id;
    await supabase.from('channels').update({ banner_dismissed_at: new Date().toISOString(), banner_dismissed_by: user.id }).eq('id', channelIdRef.current);
  };

  const checkBannerReappear = async () => {
    if (!bannerDismissed || !bannerDismissedByRef.current) return;
    const { data: cd } = await supabase.from('channels').select('banner_dismissed_at').eq('id', channelIdRef.current).single();
    if (!cd?.banner_dismissed_at) return;
    const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('channel_id', channelIdRef.current).gt('created_at', cd.banner_dismissed_at);
    if (count >= 8) {
      await supabase.from('channels').update({ banner_dismissed_at: null, banner_dismissed_by: null }).eq('id', channelIdRef.current);
      setBannerDismissed(false); bannerDismissedByRef.current = null;
    }
  };

  const getBannerText = () => {
    const name = otherUser?.full_name || otherUserName || 'this person';
    if (!gig) return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
    if (gig.status === 'pending_review') return currentUserId === gig.provider_id ? `Waiting for ${name} to submit their review.` : `Please submit your rating and review for ${name}. Tap Pending Gig above.`;
    return `Did you complete a gig with ${name}? Tap Register Gig above to boost your reputation.`;
  };

  const isBannerDismissible = !gig || gig.status !== 'pending_review';
  const showBanner = gig ? true : !bannerDismissed;
  const bannerText = getBannerText();
  const isPendingGig = gig && gig.status === 'pending_review';

  const getGigButtonLabel = () => {
    if (gigLoading) return 'Register Gig';
    if (!gig) return 'Register Gig';
    if (gig.status === 'pending_review') return currentUserId === gig.provider_id ? 'Cancel Gig' : 'Pending Gig';
    return 'Register Gig';
  };

  const handleGigButtonClick = () => {
    if (!gig) handleRegisterGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.provider_id) handleCancelGig();
    else if (gig.status === 'pending_review' && currentUserId === gig.client_id) setShowReviewForm(true);
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const days = Math.floor((now - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const shouldShowDateSeparator = (msg, prevMsg) => !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

  const updateFloatingDate = useCallback(() => {
    if (!chatContainerRef.current) return;
    const st = chatContainerRef.current.scrollTop;
    let cd = '';
    chatContainerRef.current.querySelectorAll('[data-date]').forEach(el => { if (el.offsetTop > st && el.getBoundingClientRect().top < 200 && !cd) cd = el.getAttribute('data-date'); });
    setFloatingDate(cd || '');
  }, []);

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const hasMessages = messages.length > 0;

  return (
    <div className="chat-screen">
      <div className={`chat-header ${scrolled ? 'scrolled' : ''}`}>
        <button onClick={onBack} className="chat-back-btn"><IconBack /></button>
        <div className="chat-header-info" onClick={() => otherUser?.id && onViewProfile?.({ id: otherUser.id, full_name: otherUser.full_name })}>
          <div className="chat-header-avatar">{otherUser?.profile_pic_url ? <img src={otherUser.profile_pic_url} alt="" /> : <div className="chat-avatar-placeholder"><IconAvatar /></div>}</div>
          <div className="chat-header-text">
            <h3>{otherUser?.full_name || otherUserName || 'User'}</h3>
            <div className="chat-header-row2">{otherTyping && <span className="chat-header-typing">typing...</span>}</div>
          </div>
        </div>
        {currentUserId !== otherUserId && (
          <button onClick={handleGigButtonClick} className={`chat-gig-btn ${isPendingGig ? 'chat-gig-btn-pending' : ''}`} disabled={gigLoading}>{getGigButtonLabel()}</button>
        )}
      </div>

      {error && <div className="chat-error-toast" onClick={() => setError(null)}><span>{error}</span><button>×</button></div>}

      {showBanner && bannerText && (
        <div className={`gig-banner ${!isBannerDismissible ? 'gig-banner-locked' : ''}`}>
          <div className="gig-banner-inner"><p>{bannerText}</p><p>{bannerText}</p><p>{bannerText}</p><p>{bannerText}</p></div>
          {isBannerDismissible && <button onClick={handleDismissBanner} className="gig-banner-dismiss">×</button>}
        </div>
      )}

      {floatingDate && <div className="floating-date"><span>{floatingDate}</span></div>}

      <div className="chat-messages" ref={chatContainerRef} onScroll={(e) => {
        updateFloatingDate();
        const cs = e.target.scrollTop;
        if (cs < lastScrollTop) setScrolled(false);
        else if (cs > lastScrollTop && cs > 10) setScrolled(true);
        setLastScrollTop(cs);

        const container = chatContainerRef.current;
        if (container) {
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          setShowScrollBtn(distanceFromBottom > 200);

          if (firstUnreadIndex >= 0) {
            const unreadEl = container.querySelector(`[data-msg-index="${firstUnreadIndex}"]`);
            if (unreadEl && unreadEl.getBoundingClientRect().top < container.getBoundingClientRect().top) {
              setShowUnreadBanner(false);
            }
          }
        }
      }}>
        {!hasMessages && currentUserId && <div className="chat-empty"><p>No messages yet. Say hello!</p></div>}

        {hasMessages && currentUserId && messages.map((msg, i) => {
          const isMine = msg.sender_id === currentUserId;
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const isPlayingThis = playingAudio === msg.id;
          const msgAudioState = audioState[msg.id] || {};
          const progress = msgAudioState.duration > 0 ? ((msgAudioState.currentTime || 0) / msgAudioState.duration) * 100 : 0;
          const showDuration = msg.audio_url && msgAudioState.duration;

          return (
            <React.Fragment key={msg.id}>
              {shouldShowDateSeparator(msg, prevMsg) && <div className="date-separator" data-date={formatDate(msg.created_at)}><span>{formatDate(msg.created_at)}</span></div>}
              <div className={`message-row ${isMine ? 'message-mine' : 'message-theirs'}`} data-msg-index={i}>
                {msg.image_url ? (
                  <img
                    src={msg.image_url}
                    alt=""
                    className="message-photo"
                    onClick={() => {
                      setFullScreenImage(getPhotoUrl(msg.image_url, 'full'));
                      markMessageRead(msg, currentUserId, channelIdRef, channelRef);
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${msg.status === 'failed' ? 'bubble-failed' : ''}`}>
                    {msg.audio_url ? (
                      <div className="voice-message">
                        <button className="voice-play-btn" onClick={() => handlePlayAudio(msg)}>{isPlayingThis && msgAudioState.playing ? <IconPause /> : <IconPlay />}</button>
                        <div id={`voice-bar-${msg.id}`} className="voice-progress"
                          onMouseDown={(e) => handleSeekStart(msg, e)} onTouchStart={(e) => handleSeekStart(msg, e)}
                          onMouseMove={(e) => handleSeekMove(msg, e)} onTouchMove={(e) => handleSeekMove(msg, e)}
                          onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd}
                          onClick={(e) => { e.stopPropagation(); seekTo(msg, e.clientX); }}>
                          <div className="voice-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="voice-time">{showDuration ? `${formatDuration(msgAudioState.currentTime || 0)} / ${formatDuration(msgAudioState.duration)}` : ''}</span>
                      </div>
                    ) : (
                      <p className="message-text">{msg.text}</p>
                    )}
                    <span className="message-time">{formatTime(msg.created_at)}{isMine && getStatusText(msg)}</span>
                  </div>
                )}
                {msg.image_url && isMine && (
                  <span className="message-photo-status">{getStatusText(msg)}</span>
                )}
                {msg.status === 'failed' && <button className="message-retry" onClick={() => handleRetry(msg)}>Retry</button>}
              </div>
            </React.Fragment>
          );
        })}

        {showUnreadBanner && <UnreadBanner count={unreadCount} onDismiss={() => setShowUnreadBanner(false)} />}
        <ScrollToBottomButton
          count={unreadCount}
          visible={showScrollBtn}
          onClick={() => {
            scrollToBottom();
            setUnreadCount(0);
            setShowUnreadBanner(false);
          }}
        />
        <div style={{ flexGrow: 1 }} />
      </div>

      {fullScreenImage && <div className="fullscreen-overlay" onClick={() => setFullScreenImage(null)}><button className="fullscreen-close" onClick={() => setFullScreenImage(null)}>×</button><img src={fullScreenImage} alt="" className="fullscreen-image" onClick={(e) => e.stopPropagation()} /></div>}

      {isRecording ? (
        <div className="recording-bar"><div className="recording-dot" /><span className="recording-time">0:{recordingTime < 10 ? '0' : ''}{recordingTime}</span><button onClick={cancelRecording} className="recording-cancel">Cancel</button><button onClick={stopRecording} className="recording-send"><IconSend /></button></div>
      ) : (
        <form onSubmit={handleSend} className="chat-input-bar">
          <button type="button" className="chat-input-circle-btn" onClick={() => fileInputRef.current?.click()}><IconPlus /></button>
          <input type="text" value={newMessage} onChange={(e) => { setNewMessage(e.target.value); sendTypingIndicator(); }} placeholder="Message..." className="chat-input" autoComplete="off" />
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
          {newMessage.trim() ? <button type="submit" className="chat-input-circle-btn chat-send-circle-btn"><IconSend /></button> : <button type="button" className="chat-input-circle-btn" onClick={startRecording}><IconMic /></button>}
        </form>
      )}

      {showReviewForm && (
        <div className="bottom-sheet-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}><div className="bottom-sheet-handle" />
            <div className="bottom-sheet-content">
              <h2>Rate your experience</h2><p>How was your gig with {otherUser?.full_name || otherUserName || 'the provider'}?</p>
              <div className="star-selector">{[1,2,3,4,5].map(s => <button key={s} className={`star-btn ${s <= reviewRating ? 'active' : ''}`} onClick={() => setReviewRating(s)}>{s <= reviewRating ? '★' : '☆'}</button>)}</div>
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Write your review (optional)..." className="review-textarea" rows={3} />
              <button onClick={handleSubmitReview} disabled={reviewRating === 0 || submittingReview} className="review-submit-btn">{submittingReview ? 'Submitting...' : 'Submit Review'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
