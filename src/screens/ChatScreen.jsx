import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL, IMAGEKIT_AUTH_URL, imagekitPublicKey } from '../lib/config';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);

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
        return [...prev, msg];
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
      const newMessages = data.filter(m => !seenIds.current.has(m.id));
      if (newMessages.length > 0) {
        newMessages.forEach(m => seenIds.current.add(m.id));
        setMessages(prev => {
          const existing = new Set(prev.map(p => p.id));
          const unique = newMessages.filter(m => !existing.has(m.id));
          return [...prev, ...unique].sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
          );
        });
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

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    setSending(true);
    try {
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

      const channelKey = channelIdRef.current;
      const { data: savedMessage } = await supabase.rpc('send_message', {
        p_channel_key: channelKey,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: '',
        p_image_url: result.url,
      });

      if (savedMessage && channelRef.current) {
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
    } catch (err) {
      if (isMounted.current) setError('Photo upload failed');
    } finally {
      if (isMounted.current) setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || sending) return;

    const text = newMessage.trim();
    const channelKey = channelIdRef.current;

    setNewMessage('');
    setSending(true);

    try {
      const { data: savedMessage } = await supabase.rpc('send_message', {
        p_channel_key: channelKey,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: text,
      });

      if (!savedMessage) throw new Error('Failed to send');

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
      if (isMounted.current) {
        setError(err.message);
        setNewMessage(text);
      }
    } finally {
      if (isMounted.current) setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="chat-screen">
        <div className="chat-loading"><div className="spinner"></div></div>
      </div>
    );
  }

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
        <span style={{ width: 40 }} />
      </div>

      {error && (
        <div className="chat-error-banner" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>✕</button>
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
                {msg.image_url ? (
                  <img src={msg.image_url} alt="" style={{ maxWidth: 200, borderRadius: 12, marginBottom: 4 }} />
                ) : null}
                {msg.text ? <p className="message-text">{msg.text}</p> : null}
                <span className="message-time">
                  {formatTime(msg.created_at)}
                  {isMine && msg.is_read && <span className="read-receipt"> ✓✓</span>}
                  {isMine && !msg.is_read && <span className="read-receipt"> ✓</span>}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-bar">
        <button type="button" className="chat-photo-btn" disabled={sending} onClick={() => fileInputRef.current?.click()}>
          📷
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
          disabled={sending}
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <button type="submit" disabled={(!newMessage.trim() && !sending) || sending} className="chat-send-btn">
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
