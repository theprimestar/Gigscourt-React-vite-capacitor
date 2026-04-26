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
    init();

    return () => {
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

      const channelId = (chatId || [user.id, otherUserId].sort().join('_')).replace(/-/g, '');
      channelIdRef.current = channelId;

      // Fetch other user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, profile_pic_url, id')
        .eq('id', otherUserId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('Profile fetch warning:', profileError.message);
      }

      if (isMounted.current) {
        if (profile) {
          setOtherUser(profile);
        } else {
          setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
        }
      }

      // Load message history
      const { data: history, error: historyError } = await supabase.rpc('get_messages', {
        p_channel_id: channelId.replace(/-/g, ''),
        p_cursor: null,
        p_limit: 50,
      });

      if (historyError) {
        console.warn('History load warning:', historyError.message);
      }

      if (isMounted.current && history) {
        history.forEach((m) => seenIds.current.add(m.id));
        setMessages(history.reverse());
      }

      if (isMounted.current) setLoading(false);

      // Subscribe to Broadcast
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }

      channelRef.current = supabase.channel(channelId);

      channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
        if (!isMounted.current) return;
        const msg = payload?.payload;
        if (!msg || !msg.id) return;
        if (seenIds.current.has(msg.id)) return;
        seenIds.current.add(msg.id);
        setMessages((prev) => [...prev, msg]);
        scrollToBottom();
      });

      channelRef.current.subscribe((status) => {
        if (!isMounted.current) return;
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('Channel disconnected, reconnecting...');
          setTimeout(() => {
            if (isMounted.current && channelRef.current) {
              channelRef.current.subscribe();
            }
          }, 2000);
        }
      });

      setTimeout(() => scrollToBottom(), 300);
    } catch (err) {
      console.error('Chat init error:', err);
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

    setNewMessage('');
    setSending(true);
    setError(null);

    try {
      const { data: savedMessage, error: sendError } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_sender_id: currentUserId,
        p_text: text,
      });

      if (sendError) throw new Error('Failed to send: ' + sendError.message);
      if (!savedMessage) throw new Error('No response from server');

      if (isMounted.current) {
        if (!seenIds.current.has(savedMessage.id)) {
          seenIds.current.add(savedMessage.id);
          setMessages((prev) => [...prev, savedMessage]);
        }
        scrollToBottom();

        if (channelRef.current) {
          try {
            await channelRef.current.send({
              type: 'broadcast',
              event: 'message',
              payload: savedMessage,
            });
          } catch (broadcastErr) {
            console.warn('Broadcast failed (message saved to DB):', broadcastErr.message);
          }
        }
      }
    } catch (err) {
      console.error('Send error:', err);
      if (isMounted.current) {
        setError(err.message);
        // Restore the message text so user can retry
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
