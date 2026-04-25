import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import ChatScreen from './ChatScreen';

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const channelRef = useRef(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    loadChatList();
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (chatTarget && currentUserId) {
      const chatId = [currentUserId, chatTarget.id].sort().join('_');
      setActiveChat({
        id: chatId,
        participants: [currentUserId, chatTarget.id],
      });
      if (onClearChatTarget) onClearChatTarget();
      if (onDeepScreen) onDeepScreen('chat');
    }
  }, [chatTarget, currentUserId]);

  const loadChatList = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase.rpc('get_chat_list', {
      p_user_id: user.id,
      p_limit: 30,
    });

    if (data) {
      setChats(data);
    }
    setLoading(false);
    initialLoadDone.current = true;

    // Subscribe to real-time chat list updates
    channelRef.current = supabase.channel('chatlist:' + user.id, {
      config: { broadcast: { self: false } },
    });

    channelRef.current.on('broadcast', { event: 'chat_updated' }, (payload) => {
      const update = payload.payload;
      setChats((prev) => {
        // Remove existing entry for this channel if present
        const filtered = prev.filter((c) => c.channel_id !== update.channel_id);
        // Add the updated chat at the top
        return [update, ...filtered];
      });
    });

    channelRef.current.subscribe();
  };

  // Refetch on focus (covers any missed broadcasts)
  useEffect(() => {
    const handleFocus = () => {
      if (initialLoadDone.current && currentUserId) {
        supabase.rpc('get_chat_list', {
          p_user_id: currentUserId,
          p_limit: 30,
        }).then(({ data }) => {
          if (data) setChats(data);
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUserId]);

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

  const handleBack = () => {
    setActiveChat(null);
    if (onDeepScreen) onDeepScreen(null);
    // Refetch chat list when returning from a chat
    if (currentUserId) {
      supabase.rpc('get_chat_list', {
        p_user_id: currentUserId,
        p_limit: 30,
      }).then(({ data }) => {
        if (data) setChats(data);
      });
    }
  };

  if (activeChat) {
    return (
      <ChatScreen
        chatId={activeChat.id}
        otherUserId={activeChat.participants.find((p) => p !== currentUserId)}
        otherUserName={null}
        onBack={handleBack}
      />
    );
  }

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
                setActiveChat({
                  id: chat.channel_id,
                  participants: [currentUserId, chat.other_user_id],
                });
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
