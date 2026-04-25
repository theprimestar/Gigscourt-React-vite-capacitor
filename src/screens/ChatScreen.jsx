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

  useEffect(() => {
    setupChat();
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [chatId, otherUserId]);

  const setupChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const channelId = chatId || [user.id, otherUserId].sort().join('_');

    // Fetch other user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, profile_pic_url, id')
      .eq('id', otherUserId)
      .single();

    if (profile) {
      setOtherUser(profile);
    } else {
      setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
    }

    // Load message history
    const { data: history } = await supabase.rpc('get_messages', {
      p_channel_id: channelId,
      p_cursor: null,
      p_limit: 50,
    });

    if (history) {
      setMessages(history.reverse());
    }
    setLoading(false);

    // Subscribe to real-time broadcast
    channelRef.current = supabase.channel(channelId, {
      config: { broadcast: { self: true } },
    });

    channelRef.current.on('broadcast', { event: 'message' }, (payload) => {
      setMessages((prev) => [...prev, payload.payload]);
      scrollToBottom();
    });

    channelRef.current.subscribe();
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;

    const channelId = chatId || [currentUserId, otherUserId].sort().join('_');

    // Insert message and get it back with the generated ID
    const { data: savedMessage } = await supabase.rpc('send_message', {
      p_channel_id: channelId,
      p_sender_id: currentUserId,
      p_text: newMessage.trim(),
    });

    if (savedMessage && channelRef.current) {
      // Broadcast to the other user in real-time
      channelRef.current.send({
        type: 'broadcast',
        event: 'message',
        payload: savedMessage,
      });
    }

    setNewMessage('');
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
