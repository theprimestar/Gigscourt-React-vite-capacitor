import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL } from '../lib/config';
import { imagekitPublicKey } from '../lib/imagekit';
import { 
  getGigForChannel, 
  registerGig, 
  cancelGig, 
  checkExpiredGigs, 
  shouldSendReminder, 
  updateReminderSent 
} from '../gigSystem';

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
  const [messageCountSinceDismiss, setMessageCountSinceDismiss] = useState(0);

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

  useEffect(() => {
    isMounted.current = true;
    if (isVisible) init();
    return () => {
      isMounted.current = false;
      stopPolling();
      unsubscribeChannel();
    };
  }, [chatId, otherUserId, isVisible]);

  const init = async () => {
    setError(null);
    setLoading(true);
    seenIds.current = new Set();
    setBannerDismissed(false);
    setMessageCountSinceDismiss(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (isMounted.current && myProfile) {
        setCurrentUserName(myProfile.full_name || '');
      }

      const channelKey = chatId || [user.id, otherUserId].sort().join(':');
      channelIdRef.current = channelKey;

      await supabase.rpc('reset_unread', {
        p_user_id: user.id,
        p_channel_id: channelKey,
      });

      // Check for expired gigs
      await checkExpiredGigs(user.id);

      // Load current gig state
      const currentGig = await getGigForChannel(channelKey);
      if (isMounted.current) setGig(currentGig);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, profile_pic_url, id, onesignal_player_id')
        .eq('id', otherUserId)
        .single();

      if (isMounted.current) {
        setOtherUser(profile || {
          full_name: otherUserName || 'User',
          profile_pic_url: null,
          id: otherUserId,
        });
      }

      await loadMessages(channelKey, user.id);

      if (isMounted.current) setLoading(false);

      subscribeToChannel(channelKey);
      startPolling(channelKey, user.id);

    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  const loadMessages = async (channelId, userId) => {
    const { data: history } = await supabase.rpc('get_messages', {
      p_channel_id: channelId,
      p_user_id: userId,
      p_cursor: null,
      p_cursor_id: null,
      p_limit: 50,
    });

    if (isMounted.current && history) {
      const sorted = [...history].reverse();
      sorted.forEach(m => seenIds.current.add(m.id));
      setMessages(sorted);
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const subscribeToChannel = (channelId) => {
    unsubscribeChannel();

    channelRef.current = supabase.channel(`chat:${channelId}`, {
      config: { broadcast: { self: true, ack: true } },
    });

    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      if (!isMounted.current) return;
      const msg = payload?.payload;
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, { ...msg, status: 'sent' }];
      });
      scrollToBottom();
    });

    channelRef.current.subscribe();
  };

  const unsubscribeChannel = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const startPolling = (channelId, userId) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      if (!isMounted.current) return;
      const { data } = await supabase.rpc('get_messages', {
        p_channel_id: channelId,
        p_user_id: userId,
        p_cursor: null,
        p_cursor_id: null,
        p_limit: 50,
      });
      if (!data || !isMounted.current) return;
      
      setMessages(prev => prev.map(msg => {
        const updated = data.find(m => m.id === msg.id);
        if (updated && updated.is_read && msg.status !== 'read') {
          return { ...msg, is_read: true, status: 'read' };
        }
        return msg;
      }));
      
      const newMessages = data.filter(m => !seenIds.current.has(m.id));
      if (newMessages.length > 0) {
        newMessages.forEach(m => seenIds.current.add(m.id));
        setMessages(prev => {
          const existing = new Set(prev.map(p => p.id));
          const unique = newMessages.filter(m => !existing.has(m.id));
          return [...prev, ...unique.map(m => ({ ...m, status: 'sent' }))].sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
          );
        });
      }

      // Check gig reminders during poll
      if (gig && isMounted.current) {
        checkGigReminder(gig);
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // ──────────────────────────────────────
  //  GIG OPERATIONS
  // ──────────────────────────────────────

  const handleRegisterGig = async () => {
    if (!currentUserId || !otherUserId) return;
    try {
      const result = await registerGig(channelIdRef.current, currentUserId, otherUserId);
      if (isMounted.current) {
        setGig({
          id: result.gig_id,
          status: 'pending_review',
          provider_id: currentUserId,
          client_id: otherUserId,
        });
        setBannerDismissed(false);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const handleCancelGig = async () => {
    if (!gig || !currentUserId) return;
    try {
      await cancelGig(gig.id, currentUserId);
      if (isMounted.current) {
        setGig(null);
        setBannerDismissed(false);
        setMessageCountSinceDismiss(0);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    setMessageCountSinceDismiss(0);
  };

  const checkGigReminder = async (currentGig) => {
    if (!currentGig || currentGig.status !== 'pending_review') return;
    if (currentUserId === currentGig.client_id && shouldSendReminder(currentGig)) {
      // Send reminder push to this client
      if (otherUser?.onesignal_player_id) {
        fetch(PUSH_NOTIFICATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            include_player_ids: [otherUser.onesignal_player_id], // Actually send to self since user is client
            headings: { en: 'Reminder' },
            contents: { en: `Please rate your experience with ${otherUserName || 'the provider'}` },
            data: { channel_id: channelIdRef.current },
          }),
        }).catch(() => {});
      }
      await updateReminderSent(currentGig.id);
    }
  };

  // ──────────────────────────────────────
  //  BANNER LOGIC
  // ──────────────────────────────────────

  const shouldShowBanner = () => {
    // Always show during pending review
    if (gig && gig.status === 'pending_review') return true;
    // Show if no gig and not dismissed
    if (!gig && !bannerDismissed) return true;
    // Show if completed or cancelled
    if (gig && (gig.status === 'completed' || gig.status === 'cancelled')) return true;
    // Show if 8 messages sent since dismiss
    if (!gig && bannerDismissed && messageCountSinceDismiss >= 8) return true;
    return false;
  };

  const getBannerContent = () => {
    const otherName = otherUser?.full_name || otherUserName || 'this person';

    if (!gig) {
      return {
        text: `Did you complete a gig with ${otherName}? Register it now to boost your reputation.`,
        button: { text: 'Register Gig', action: handleRegisterGig, dismissible: true },
      };
    }

    switch (gig.status) {
      case 'pending_review':
        if (currentUserId === gig.provider_id) {
          return {
            text: `Waiting for ${otherName} to submit their review.`,
            button: { text: 'Cancel Gig', action: handleCancelGig, dismissible: false },
          };
        }
        return {
          text: `Please submit your rating and review for ${otherName}.`,
          button: null,
        };
      case 'completed':
        return {
          text: `Gig completed! Register another gig with ${otherName}?`,
          button: { text: 'Register Gig', action: handleRegisterGig, dismissible: true },
        };
      case 'cancelled':
        return {
          text: `Gig cancelled. Register a new gig with ${otherName}?`,
          button: { text: 'Register Gig', action: handleRegisterGig, dismissible: true },
        };
      default:
        return null;
    }
  };

  // ──────────────────────────────────────
  //  MESSAGE SENDING
  // ──────────────────────────────────────

  const sendTextMessage = async (text, tempId) => {
    const channelKey = channelIdRef.current;
    try {
      const { data: savedMessage } = await supabase.rpc('send_message', {
        p_channel_key: channelKey,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: text,
      });

      if (!savedMessage) throw new Error('Failed to send');

      setMessages(prev => prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
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
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const processPhotoQueue = useCallback(async () => {
    if (processingPhotos.current || photoQueue.current.length === 0) return;
    processingPhotos.current = true;

    while (photoQueue.current.length > 0) {
      const item = photoQueue.current[0];
      try {
        await uploadPhoto(item.file, item.tempId);
      } catch (err) {
        setMessages(prev => prev.map(m => m.id === item.tempId ? { ...m, status: 'failed' } : m));
      }
      photoQueue.current.shift();
    }
    processingPhotos.current = false;
  }, [otherUserId, otherUser, currentUserId, currentUserName]);

  const uploadPhoto = async (file, tempId) => {
    const authRes = await fetch(IMAGEKIT_AUTH_URL);
    const auth = await authRes.json();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', 'chat-photo.jpg');
    formData.append('folder', '/chat-photos');
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

    const optimizedUrl = result.url + '?tr=f-webp,fo-lossless';

    const channelKey = channelIdRef.current;
    const { data: savedMessage } = await supabase.rpc('send_message', {
      p_channel_key: channelKey,
      p_sender_id: currentUserId,
      p_other_user_id: otherUserId,
      p_text: '',
      p_image_url: optimizedUrl,
    });

    if (!savedMessage) throw new Error('Failed to save photo');

    setMessages(prev => prev.map(m => m.id === tempId ? { ...savedMessage, status: 'sent' } : m));
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
          headings: { en: currentUserName || 'New photo' },
          contents: { en: '📷 Photo' },
          data: { channel_id: channelKey },
        }),
      }).catch(() => {});
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;

    const text = newMessage.trim();
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    setNewMessage('');

    const tempMsg = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text: text,
      image_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending',
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    // Track for banner reappear
    if (bannerDismissed && !gig) {
      const newCount = messageCountSinceDismiss + 1;
      setMessageCountSinceDismiss(newCount);
      if (newCount >= 8) {
        setBannerDismissed(false);
        setMessageCountSinceDismiss(0);
      }
    }

    sendTextMessage(text, tempId);
  };

  const retryMessage = (tempId, text) => {
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sending' } : m));
    sendTextMessage(text, tempId);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    const tempId = 'temp-photo-' + Date.now();

    const tempMsg = {
      id: tempId,
      channel_id: channelIdRef.current,
      sender_id: currentUserId,
      text: '',
      image_url: null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'uploading',
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    photoQueue.current.push({ file, tempId });
    processPhotoQueue();

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getStatusText = (msg) => {
    if (msg.sender_id !== currentUserId) return null;
    switch (msg.status) {
      case 'sending':
        return <span className="message-status sending">...</span>;
      case 'sent':
        return <span className="message-status sent">Sent</span>;
      case 'read':
        return <span className="message-status read">Read</span>;
      case 'failed':
        return (
          <button 
            className="message-retry-btn" 
            onClick={() => {
              if (msg.image_url) {
                setError('Please reselect the photo to retry');
              } else {
                retryMessage(msg.id, msg.text);
              }
            }}
          >
            Retry
          </button>
        );
      case 'uploading':
        return <span className="message-status sending">Uploading...</span>;
      default:
        return null;
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ──────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────

  if (loading) {
    return (
      <div className="chat-screen">
        <div className="chat-loading"><div className="spinner"></div></div>
      </div>
    );
  }

  const bannerContent = getBannerContent();

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn">←</button>
        <div
          className="chat-header-info-tappable"
          onClick={() => {
            if (otherUser?.id && onViewProfile) {
              onViewProfile({ id: otherUser.id, full_name: otherUser.full_name });
            }
          }}
        >
          <div className="chat-header-avatar">
            {otherUser?.profile_pic_url ? (
              <img src={otherUser.profile_pic_url} alt="" />
            ) : (
              <div className="chat-header-avatar-placeholder">👤</div>
            )}
          </div>
          <div className="chat-header-info">
            <h3>{otherUser?.full_name || 'User'}</h3>
          </div>
        </div>
        {/* Header gig button */}
        {gig && gig.status === 'pending_review' ? (
          currentUserId === gig.provider_id ? (
            <button onClick={handleCancelGig} className="chat-header-gig-btn">Cancel Gig</button>
          ) : (
            <span className="chat-header-gig-label">Pending Gig</span>
          )
        ) : (
          <button onClick={handleRegisterGig} className="chat-header-gig-btn">Register Gig</button>
        )}
      </div>

      {error && (
        <div className="chat-error-banner" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>✕</button>
        </div>
      )}

      {/* Gig Banner */}
      {shouldShowBanner() && bannerContent && (
        <div className={`gig-banner ${bannerContent.button?.dismissible === false ? 'gig-banner-persistent' : ''}`}>
          <p className="gig-banner-text">{bannerContent.text}</p>
          <div className="gig-banner-actions">
            {bannerContent.button && (
              <button onClick={bannerContent.button.action} className="gig-banner-btn">
                {bannerContent.button.text}
              </button>
            )}
            {bannerContent.button?.dismissible !== false && (
              <button onClick={handleDismissBanner} className="gig-banner-dismiss">✕</button>
            )}
          </div>
        </div>
      )}

      <div className="chat-messages" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div className="chat-empty"><p>No messages yet. Say hello!</p></div>
        )}

        {messages.map(msg => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`message-row ${isMine ? 'message-mine' : 'message-other'}`}>
              <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'}`}>
                {msg.status === 'uploading' && !msg.image_url ? (
                  <div className="chat-photo-uploading">
                    <div className="upload-progress-bar">
                      <div className="upload-progress-fill"></div>
                    </div>
                    <span className="upload-progress-text">Uploading photo...</span>
                  </div>
                ) : msg.image_url ? (
                  <img 
                    src={msg.image_url} 
                    alt="" 
                    className="chat-photo"
                    onClick={() => setFullScreenImage(msg.image_url)}
                  />
                ) : null}
                {msg.text ? <p className="message-text">{msg.text}</p> : null}
                <span className="message-time">
                  {formatTime(msg.created_at)}
                  {isMine && getStatusText(msg)}
                </span>
              </div>
              {isMine && msg.status === 'failed' && !msg.image_url && (
                <button 
                  className="message-retry-btn standalone-retry"
                  onClick={() => retryMessage(msg.id, msg.text)}
                >
                  Retry
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {fullScreenImage && (
        <div className="fullscreen-image-overlay" onClick={() => setFullScreenImage(null)}>
          <button className="fullscreen-close-btn" onClick={() => setFullScreenImage(null)}>✕</button>
          <img src={fullScreenImage} alt="" className="fullscreen-image" />
        </div>
      )}

      <form onSubmit={handleSend} className="chat-input-bar">
        <button type="button" className="chat-photo-btn" onClick={() => fileInputRef.current?.click()}>
          <span className="plus-icon">+</span>
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <button type="submit" disabled={!newMessage.trim()} className="chat-send-btn">
          ➤
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
