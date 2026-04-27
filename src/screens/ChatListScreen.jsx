import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat, isVisible }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const channelRef = useRef(null);
  const isMounted = useRef(true);

  // Load on mount
  useEffect(() => {
    isMounted.current = true;
    loadChatList();

    return () => {
      isMounted.current = false;
      disconnectChannel();
    };
  }, []);

  // Handle visibility — refetch from DB, then subscribe for live updates
  useEffect(() => {
    if (!currentUserId || !isMounted.current) return;

    if (isVisible) {
      loadChatList();
      subscribeToUpdates();
    } else {
      disconnectChannel();
    }
  }, [isVisible, currentUserId]);

  // Handle opening a chat from another tab
  useEffect(() => {
    if (chatTarget && currentUserId && onStartChat) {
      onStartChat({ id: chatTarget.id, full_name: chatTarget.userName || 'User' });
      if (onClearChatTarget) onClearChatTarget();
      if (onDeepScreen) onDeepScreen('chat');
    }
  }, [chatTarget, currentUserId]);

  const loadChatList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);

      const { data } = await supabase.rpc('get_chat_list', {
        p_user_id: user.id,
        p_limit: 30,
      });

      if (isMounted.current && data) {
        const validChats = data.filter(c => c.other_user_id !== null);
        setChats(validChats);
      }
    } catch (err) {
      console.error('Chat list load error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const subscribeToUpdates = () => {
    if (channelRef.current) return;

    const channelName = 'chatlist-' + currentUserId.replace(/-/g, '');
    channelRef.current = supabase.channel(channelName);

    // When a chat_updated event arrives, refetch from DB (not merge)
    channelRef.current.on('broadcast', { event: 'chat_updated' }, () => {
      if (!isMounted.current) return;
      supabase.rpc('get_chat_list', {
        p_user_id: currentUserId,
        p_limit: 30,
      }).then(({ data }) => {
        if (isMounted.current && data) {
          const validChats = data.filter(c => c.other_user_id !== null);
          setChats(validChats);
        }
      });
    });

    channelRef.current.subscribe();
  };

  const disconnectChannel = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="chat-list-screen">
        <div className="chat-list-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-list-screen">
      <header className="chat-list-header">
        <h1>Chats</h1>
      </header>

      {chats.length === 0 ? (
        <div className="chat-list-empty">
          <p>No conversations yet</p>
          <p className="chat-list-empty-sub">Find a provider and start chatting!</p>
        </div>
      ) : (
        <div className="chat-list-items">
          {chats.map((chat) => (
            <div
              key={chat.channel_id}
              className="chat-list-item"
              onClick={() => {
                if (onStartChat) {
                  onStartChat({ id: chat.other_user_id, full_name: chat.other_user_name });
                }
                if (onDeepScreen) onDeepScreen('chat');
              }}
            >
              <div className="chat-list-avatar">
                {chat.other_user_pic ? (
                  <img src={chat.other_user_pic} alt="" />
                ) : (
                  <div className="chat-list-avatar-placeholder">👤</div>
                )}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-top">
                  <h3>{chat.other_user_name}</h3>
                  <span className="chat-list-time">{formatTime(chat.last_message_at)}</span>
                </div>
                <p className="chat-list-preview">{chat.last_message || ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatListScreen;
