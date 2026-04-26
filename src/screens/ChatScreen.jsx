import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    console.log('[ChatScreen] Mounting with chatId:', chatId, 'otherUserId:', otherUserId);
    init();

    return () => {
      console.log('[ChatScreen] Unmounting');
      isMounted.current = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [chatId, otherUserId]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isMounted.current) return;
    setCurrentUserId(user.id);
    console.log('[ChatScreen] Current user:', user.id);

    const channelId = chatId || [user.id, otherUserId].sort().join('_');
    channelIdRef.current = channelId;
    console.log('[ChatScreen] Channel ID:', channelId);

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, profile_pic_url, id')
      .eq('id', otherUserId)
      .single();

    if (isMounted.current) {
      if (profile) {
        setOtherUser(profile);
        console.log('[ChatScreen] Other user loaded:', profile.full_name);
      } else {
        setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
      }
    }

    const { data: history } = await supabase.rpc('get_messages', {
      p_channel_id: channelId,
      p_cursor: null,
      p_limit: 50,
    });

    if (isMounted.current && history) {
      console.log('[ChatScreen] History loaded:', history.length, 'messages');
      history.forEach((m) => seenIds.current.add(m.id));
      setMessages(history.reverse());
    }

    if (isMounted.current) setLoading(false);

    console.log('[ChatScreen] Subscribing to Broadcast channel:', channelId);
    channelRef.current = supabase.channel(channelId);

    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      console.log('[ChatScreen] 📨 Broadcast RECEIVED:', payload.payload.text);
      if (!isMounted.current) return;
      const msg = payload.payload;
      if (seenIds.current.has(msg.id)) {
        console.log('[ChatScreen] ⚠️ Duplicate message ignored:', msg.id);
        return;
      }
      seenIds.current.add(msg.id);
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
    });

    channelRef.current.subscribe((status) => {
      console.log('[ChatScreen] Subscription status:', status);
    });

    setTimeout(() => scrollToBottom(), 300);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;

    const text = newMessage.trim();
    const channelId = channelIdRef.current;

    setNewMessage('');

    console.log('[ChatScreen] 📤 Saving message to DB...');
    const { data: savedMessage } = await supabase.rpc('send_message', {
      p_channel_id: channelId,
      p_sender_id: currentUserId,
      p_text: text,
    });

    if (savedMessage && isMounted.current) {
      console.log('[ChatScreen] ✅ Message saved:', savedMessage.id);
      if (!seenIds.current.has(savedMessage.id)) {
        seenIds.current.add(savedMessage.id);
        setMessages((prev) => [...prev, savedMessage]);
      }
      scrollToBottom();

      if (channelRef.current) {
        console.log('[ChatScreen] 📡 Broadcasting message...');
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: savedMessage,
        }).then(() => {
          console.log('[ChatScreen] ✅ Broadcast sent successfully');
        }).catch((err) => {
          console.error('[ChatScreen] ❌ Broadcast failed:', err);
        });
      } else {
        console.error('[ChatScreen] ❌ No channel ref to broadcast on');
      }
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
        />
        <button type="submit" disabled={!newMessage.trim()} className="chat-send-btn">
          ➤
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
