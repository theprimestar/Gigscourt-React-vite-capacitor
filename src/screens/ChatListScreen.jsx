import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { checkExpiredGigs } from '../gigSystem';

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat, isVisible }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const cursorRef = useRef(null);
  const observerRef = useRef(null);
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    loadChatList(false);
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (isVisible && initialLoadDone.current && isMounted.current) {
      cursorRef.current = null;
      setHasMore(true);
      loadChatList(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (chatTarget && currentUserId && onStartChat) {
      onStartChat({ id: chatTarget.id, full_name: chatTarget.userName || 'User', chatId: chatTarget.channel_id || null });
      if (onClearChatTarget) onClearChatTarget();
      if (onDeepScreen) onDeepScreen('chat');
    }
  }, [chatTarget, currentUserId]);

  useEffect(() => {
    const handleFocus = () => {
      if (isMounted.current && currentUserId && isVisible && !fetchingRef.current) {
        cursorRef.current = null;
        setHasMore(true);
        loadChatList(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUserId, isVisible]);

  const loadChatList = async (append) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);
      checkExpiredGigs(user.id);
      
      const { data } = await supabase.rpc('get_chat_list', {
        p_user_id: user.id,
        p_limit: 30,
        p_cursor: append ? cursorRef.current : null,
      });

      if (isMounted.current && data) {
        const seen = new Set();
        const validChats = data.filter(c => {
          if (!c.other_user_id) return false;
          if (seen.has(c.channel_id)) return false;
          seen.add(c.channel_id);
          return true;
        });
        
        if (append) {
          setChats(prev => {
            const existingIds = new Set(prev.map(c => c.channel_id));
            const newOnes = validChats.filter(c => !existingIds.has(c.channel_id));
            return [...prev, ...newOnes];
          });
        } else {
          setChats(validChats);
        }
        
        if (data.length > 0) {
          cursorRef.current = data[data.length - 1].last_message_at;
        }
        setHasMore(data.length === 30);
      }
      
      initialLoadDone.current = true;
    } catch (err) {
      console.error('Chat list error:', err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      fetchingRef.current = false;
    }
  };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !currentUserId) return;
    setLoadingMore(true);
    loadChatList(true);
  }, [loadingMore, hasMore, currentUserId]);

  const lastChatRef = useCallback(
    (node) => {
      if (loading || loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [loading, loadingMore, hasMore, loadMore]
  );

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
        <div className="chat-list-loading"><div className="spinner"></div></div>
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
          {chats.map((chat, index) => {
            const isLast = index === chats.length - 1;
            return (
              <div
                key={chat.channel_id}
                ref={isLast ? lastChatRef : null}
                className="chat-list-item"
                onClick={() => {
                  if (onStartChat) {
                    onStartChat({
                      id: chat.other_user_id,
                      full_name: chat.other_user_name,
                      chatId: chat.channel_id,
                    });
                  }
                  if (onDeepScreen) onDeepScreen('chat');
                }}
              >
                <div className="chat-list-avatar" style={{ position: 'relative' }}>
                  {chat.other_user_pic ? (
                    <img src={chat.other_user_pic} alt="" />
                  ) : (
                    <div className="chat-list-avatar-placeholder">👤</div>
                  )}
                  {chat.has_unread && (
                    <span className="unread-dot"></span>
                  )}
                </div>
                <div className="chat-list-info">
                  <div className="chat-list-top">
                    <h3 style={{ fontWeight: chat.has_unread ? 600 : 400 }}>{chat.other_user_name}</h3>
                    <span className="chat-list-time">{formatTime(chat.last_message_at)}</span>
                  </div>
                  <p className="chat-list-preview" style={{ fontWeight: chat.has_unread ? 500 : 400 }}>
                    {chat.last_message || ''}
                  </p>
                </div>
              </div>
            );
          })}
          {loadingMore && (
            <div className="home-loading-more">
              <div className="spinner"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatListScreen;
