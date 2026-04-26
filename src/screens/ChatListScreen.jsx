import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat, isVisible }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const channelRef = useRef(null);
  const seenIds = useRef(new Set());
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

  // Handle visibility
  useEffect(() => {
    if (!currentUserId) return;

    if (isVisible) {
      refetchChatList();
      subscribeToUpdates();
    } else {
      disconnectChannel();
    }
  }, [isVisible, currentUserId]);

  // Handle chatTarget from other tabs
  useEffect(() => {
    if (chatTarget && currentUserId) {
      if (onStartChat) {
        onStartChat({ id: chatTarget.id, full_name: chatTarget.userName || 'User' });
      }
      if (onClearChatTarget) onClearChatTarget();
      if (onDeepScreen) onDeepScreen('chat');
    }
  }, [chatTarget, currentUserId]);

  const loadChatList = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error('Auth failed');
      if (!user) throw new Error('Not authenticated');
      if (!isMounted.current) return;

      setCurrentUserId(user.id);
      await refetchChatListInternal(user.id);
    } catch (err) {
      console.error('Chat list load error:', err);
      if (isMounted.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  const refetchChatList = async () => {
    if (!currentUserId || !isMounted.current) return;
    await refetchChatListInternal(currentUserId);
  };

  const refetchChatListInternal = async (userId) => {
    try {
      const shortId = userId.replace(/-/g, '').substring(0, 8);
      const { data, error: rpcError } = await supabase.rpc('get_chat_list', {
        p_user_id: userId,
        p_limit: 30,
      });

      if (rpcError) throw new Error('Failed to load chats: ' + rpcError.message);

      if (isMounted.current && data) {
        const newChats = (data || []).filter(c => c.other_user_id !== null);
        setChats(newChats);
      }
    } catch (err) {
      console.error('Refetch error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const subscribeToUpdates = () => {
    if (channelRef.current) return;

    try {
      const channelName = 'chatlist-' + currentUserId.replace(/-/g, '');
      channelRef.current = supabase.channel(channelName);

      channelRef.current.on('broadcast', { event: 'chat_updated' }, (payload) => {
        if (!isMounted.current) return;
        const update = payload?.payload;
        if (!update || !update.channel_id) return;
        
        const dedupeKey = update.channel_id + '_' + update.last_message_at;
        if (seenIds.current.has(dedupeKey)) return;
        seenIds.current.add(dedupeKey);

        setChats((prev) => {
          const filtered = prev.filter((c) => c.channel_id !== update.channel_id);
          return [update, ...filtered];
        });
      });

      channelRef.current.subscribe((status) => {
        if (!isMounted.current) return;
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('Chat list channel disconnected, reconnecting...');
          setTimeout(() => {
            if (isMounted.current && isVisible && channelRef.current) {
              channelRef.current.subscribe();
            }
          }, 2000);
        }
      });
    } catch (err) {
      console.error('Subscribe error:', err);
    }
  };

  const disconnectChannel = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  // Refetch on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (isMounted.current && currentUserId && isVisible) {
        refetchChatList();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUserId, isVisible]);

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

      {error && (
        <div className="chat-error-banner" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>✕</button>
        </div>
      )}

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
