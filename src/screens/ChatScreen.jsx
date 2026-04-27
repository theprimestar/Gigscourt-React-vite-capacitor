import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL } from '../lib/config';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    init();

    return () => {
      isMounted.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [chatId, otherUserId]);

  const init = async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);

      const channelId = (chatId || [user.id, otherUserId].sort().join('_')).replace(/-/g, '');
      channelIdRef.current = channelId;

      // Clear unread
      await supabase.rpc('reset_unread', {
        p_user_id: user.id,
        p_channel_id: channelId,
      });

      // Fetch other user
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, profile_pic_url, id, onesignal_player_id')
        .eq('id', otherUserId)
        .single();

      if (isMounted.current) {
        setOtherUser(profile || { full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
      }

      // Load history
      const { data: history } = await supabase.rpc('get_messages', {
        p_channel_id: channelId,
        p_cursor: null,
        p_limit: 50,
      });

      if (isMounted.current && history) {
        history.forEach(m => seenIds.current.add(m.id));
        setMessages(history.reverse());
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 50);
      }

      if (isMounted.current) setLoading(false);

      // Subscribe to broadcast
      channelRef.current = supabase.channel(channelId);
      channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
        if (!isMounted.current) return;
        const msg = payload?.payload;
        if (!msg?.id || seenIds.current.has(msg.id)) return;
        seenIds.current.add(msg.id);
        setMessages(prev => [...prev, msg]);
        scrollToBottom();
      });
      channelRef.current.subscribe();

      // Polling fallback
      pollIntervalRef.current = setInterval(async () => {
        if (!isMounted.current) return;
        const { data } = await supabase.rpc('get_messages', {
          p_channel_id: channelIdRef.current,
          p_cursor: null,
          p_limit: 50,
        });
        if (!data || !isMounted.current) return;
        let added = false;
        data.forEach(m => {
          if (!seenIds.current.has(m.id)) {
            seenIds.current.add(m.id);
            added = true;
          }
        });
        if (added) {
          setMessages(prev => {
            const all = [...prev];
            data.forEach(m => {
              if (!all.some(e => e.id === m.id)) all.push(m);
            });
            return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          });
        }
      }, 5000);

    } catch (err) {
      if (isMounted.current) setError(err.message);
      if (isMounted.current) setLoading(false);
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

    try {
      const { data: savedMessage } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_sender_id: currentUserId,
        p_text: text,
      });

      if (!savedMessage) throw new Error('Failed to send');

      if (isMounted.current) {
        if (!seenIds.current.has(savedMessage.id)) {
          seenIds.current.add(savedMessage.id);
          setMessages(prev => [...prev, savedMessage]);
        }
        scrollToBottom();

        // Broadcast to chat channel
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'message',
            payload: savedMessage,
          }).catch(() => {});
        }

        // Broadcast to chat list channels (both users)
        const otherShortId = otherUserId.replace(/-/g, '');
        const ownShortId = currentUserId.replace(/-/g, '');

        const listUpdate = {
          channel_id: channelId,
          last_message: text,
          last_message_at: savedMessage.created_at,
        };

        // Tell other user's chat list to refresh
        supabase.channel('chatlist-' + otherShortId).send({
          type: 'broadcast',
          event: 'chat_updated',
          payload: listUpdate,
        }).catch(() => {});

        // Tell own chat list to refresh
        supabase.channel('chatlist-' + ownShortId).send({
          type: 'broadcast',
          event: 'chat_updated',
          payload: listUpdate,
        }).catch(() => {});

        // Push notification
        if (otherUser?.onesignal_player_id) {
          fetch(PUSH_NOTIFICATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: [otherUser.onesignal_player_id],
              heading: otherUser.full_name || otherUserName || 'New message',
              content: text,
              data: { channel_id: channelId },
            }),
          }).catch(() => {});
        }
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
        <div className="chat-header-info-tappable" onClick={() => {
          if (otherUser?.id && onViewProfile) onViewProfile({ id: otherUser.id, full_name: otherUser.full_name });
        }}>
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

      <div className="chat-messages" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div className="chat-empty"><p>No messages yet. Say hello!</p></div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message-row ${msg.sender_id === currentUserId ? 'message-mine' : 'message-other'}`}>
            <div className={`message-bubble ${msg.sender_id === currentUserId ? 'bubble-mine' : 'bubble-other'}`}>
              <p className="message-text">{msg.text}</p>
              <span className="message-time">{formatTime(msg.created_at)}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
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
