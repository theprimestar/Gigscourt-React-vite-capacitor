import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    console.log('[CHAT] Mounting. chatId:', chatId, 'otherUserId:', otherUserId);
    init();

    return () => {
      console.log('[CHAT] Unmounting');
      isMounted.current = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, otherUserId]);

  const init = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Auth failed: ' + authError.message);
      if (!user) throw new Error('Not authenticated');
      if (!isMounted.current) return;

      setCurrentUserId(user.id);
      console.log('[CHAT] Current user ID:', user.id);

      // Use only the first 8 chars of each UUID to create a short channel name
const id1 = user.id.replace(/-/g, '').substring(0, 8);
const id2 = otherUserId.replace(/-/g, '').substring(0, 8);
const ids = [id1, id2].sort();
const channelId = 'chat_' + ids[0] + '_' + ids[1];
      channelIdRef.current = channelId;
      console.log('[CHAT] Channel ID:', channelId);

      // Fetch other user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, profile_pic_url, id')
        .eq('id', otherUserId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('[CHAT] Profile fetch warning:', profileError.message);
      }

      if (isMounted.current) {
        if (profile) {
          setOtherUser(profile);
          console.log('[CHAT] Other user:', profile.full_name);
        } else {
          setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
          console.log('[CHAT] Other user fallback:', otherUserName);
        }
      }

      // Load message history
      console.log('[CHAT] Loading history for channel:', channelId);
      const { data: history, error: historyError } = await supabase.rpc('get_messages', {
        p_channel_id: channelId,
        p_cursor: null,
        p_limit: 50,
      });

      if (historyError) {
        console.warn('[CHAT] History load error:', historyError.message);
      }

      if (isMounted.current && history) {
        console.log('[CHAT] History loaded:', history.length, 'messages');
        history.forEach((m) => seenIds.current.add(m.id));
        setMessages(history.reverse());
      }

      if (isMounted.current) setLoading(false);

      // Subscribe to Broadcast
      if (channelRef.current) {
        console.log('[CHAT] Removing old channel');
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }

      console.log('[CHAT] Creating channel:', channelId);
      channelRef.current = supabase.channel(channelId);

      channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
        console.log('[CHAT] 📨 Broadcast RECEIVED:', payload?.payload?.text);
        if (!isMounted.current) {
          console.log('[CHAT] Ignored - not mounted');
          return;
        }
        const msg = payload?.payload;
        if (!msg || !msg.id) {
          console.log('[CHAT] Ignored - invalid payload');
          return;
        }
        if (seenIds.current.has(msg.id)) {
          console.log('[CHAT] Ignored - duplicate:', msg.id);
          return;
        }
        console.log('[CHAT] Adding message to UI:', msg.text);
        seenIds.current.add(msg.id);
        setMessages((prev) => [...prev, msg]);
        scrollToBottom();
      });

      channelRef.current.subscribe((status) => {
        console.log('[CHAT] Subscription status:', status);
        if (!isMounted.current) return;
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[CHAT] Channel disconnected, reconnecting in 2s...');
          setTimeout(() => {
            if (isMounted.current && channelRef.current) {
              console.log('[CHAT] Reconnecting...');
              channelRef.current.subscribe();
            }
          }, 2000);
        }
      });

      console.log('[CHAT] Channel subscribed');
      setTimeout(() => scrollToBottom(), 300);
    } catch (err) {
      console.error('[CHAT] Init error:', err);
      if (isMounted.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || sending) return;

    const text = newMessage.trim();
    const channelId = channelIdRef.current;

    console.log('[CHAT] 📤 SEND START - text:', text);
    console.log('[CHAT] 📤 Channel ID:', channelId);
    console.log('[CHAT] 📤 Sender ID:', currentUserId);

    setNewMessage('');
    setSending(true);
    setError(null);

    try {
      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_sender_id: currentUserId,
        p_text: text,
      });

      if (sendError) {
        console.error('[CHAT] ❌ RPC error:', sendError);
        throw new Error('Failed to send: ' + sendError.message);
      }
      if (!savedMessage) {
        console.error('[CHAT] ❌ No response from RPC');
        throw new Error('No response from server');
      }

      console.log('[CHAT] ✅ Message saved:', savedMessage.id);

      if (isMounted.current) {
        if (!seenIds.current.has(savedMessage.id)) {
          seenIds.current.add(savedMessage.id);
          setMessages((prev) => [...prev, savedMessage]);
          console.log('[CHAT] Added to own UI');
        }
        scrollToBottom();

        if (channelRef.current) {
          console.log('[CHAT] 📡 Broadcasting to channel:', channelId);
          try {
            const result = await channelRef.current.send({
              type: 'broadcast',
              event: 'message',
              payload: savedMessage,
            });
            console.log('[CHAT] ✅ Broadcast sent, result:', result);
          } catch (broadcastErr) {
            console.error('[CHAT] ❌ Broadcast error:', broadcastErr);
          }
        } else {
          console.error('[CHAT] ❌ No channel ref available');
        }
      }
    } catch (err) {
      console.error('[CHAT] ❌ Send error:', err);
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
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleHeaderTap = () => {
    if (otherUser?.id && onViewProfile) {
      onViewProfile({ id: otherUser.id, full_name: otherUser.full_name });
    }
  };

  if (loading) {
    return (
      <div className="chat-screen">
        <div className="chat-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn">←</button>
        <div className="chat-header-info-tappable" onClick={handleHeaderTap}>
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

      <div className="chat-toast">
        <p>Did you complete a gig with {otherUser?.full_name?.split(' ')[0]}? <button className="chat-toast-btn">Register it now</button></p>
      </div>

      {error && (
        <div className="chat-error-banner" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>✕</button>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`message-row ${isMine ? 'message-mine' : 'message-other'}`}>
              <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'}`}>
                <p className="message-text">{msg.text}</p>
                <span className="message-time">{formatTime(msg.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
          disabled={sending}
        />
        <button type="submit" disabled={!newMessage.trim() || sending} className="chat-send-btn">
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
