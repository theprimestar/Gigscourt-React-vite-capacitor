import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { checkExpiredGigs } from '../gigSystem';
import '../Chat.css';

const IconAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);

const IconPin = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </svg>
);

const IconDeleteSwipe = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconPinSwipe = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
  </svg>
);

const CACHE_KEY = 'gigscourt_chatlist_cache';

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat, isVisible }) {
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(!chats.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [swipedChatId, setSwipedChatId] = useState(null);
  const cursorRef = useRef(null);
  const observerRef = useRef(null);
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);
  const initialLoadDone = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

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

      const [{ data }, { data: pinnedData }] = await Promise.all([
        supabase.rpc('get_chat_list', { p_user_id: user.id, p_limit: 30, p_cursor: append ? cursorRef.current : null }),
        supabase.from('channel_members').select('channel_id').eq('user_id', user.id).not('pinned_at', 'is', null)
      ]);

      if (isMounted.current && data) {
        const pinnedIds = new Set((pinnedData || []).map(p => p.channel_id));
        const seen = new Set();
        const validChats = data.filter(c => {
          if (!c.other_user_id) return false;
          if (seen.has(c.channel_id)) return false;
          seen.add(c.channel_id);
          return true;
        }).map(c => ({ ...c, isPinned: pinnedIds.has(c.channel_id) }));

        const sorted = [...validChats].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return 0;
        });

        if (append) {
          setChats(prev => {
            const existingIds = new Set(prev.map(c => c.channel_id));
            const newOnes = sorted.filter(c => !existingIds.has(c.channel_id));
            const result = [...prev, ...newOnes];
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
            return result;
          });
        } else {
          setChats(sorted);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(sorted)); } catch {}
        }
        if (data.length > 0) cursorRef.current = data[data.length - 1].last_message_at;
        setHasMore(data.length === 30);
      }
      initialLoadDone.current = true;
    } catch (err) { console.error('Chat list error:', err); }
    finally { if (isMounted.current) { setLoading(false); setLoadingMore(false); } fetchingRef.current = false; }
  };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !currentUserId) return;
    setLoadingMore(true);
    loadChatList(true);
  }, [loadingMore, hasMore, currentUserId]);

  const lastChatRef = useCallback((node) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) loadMore();
    });
    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, loadMore]);

  const handleDeleteChat = async (channelId) => {
    if (!currentUserId) return;
    await supabase.from('channel_members').update({ deleted_at: new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', currentUserId);
    setChats(prev => {
      const result = prev.filter(c => c.channel_id !== channelId);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
      return result;
    });
    setSwipedChatId(null);
  };

  const handlePinChat = async (channelId) => {
    if (!currentUserId) return;
    const chat = chats.find(c => c.channel_id === channelId);
    if (chat?.isPinned) {
      await supabase.from('channel_members').update({ pinned_at: null }).eq('channel_id', channelId).eq('user_id', currentUserId);
      setChats(prev => {
        const result = prev.map(c => c.channel_id === channelId ? { ...c, isPinned: false } : c);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
        return result;
      });
    } else {
      await supabase.from('channel_members').update({ pinned_at: new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', currentUserId);
      setChats(prev => {
        const result = prev.map(c => c.channel_id === channelId ? { ...c, isPinned: true } : c);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
        return result;
      });
    }
    setSwipedChatId(null);
  };

  const handleTouchStart = (e, chatId) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e, chatId) => {
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
      if (diffX < 0) setSwipedChatId(swipedChatId === chatId ? null : chatId);
      else if (diffX > 0) handlePinChat(chatId);
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

  return (
    <div className="chat-list-screen">
      <header className="chat-list-header"><h1>Chats</h1></header>
      {chats.length === 0 && !loading ? (
        <div className="chat-list-empty"><p>No conversations yet</p><p className="chat-list-empty-sub">Find a provider and start chatting!</p></div>
      ) : (
        <div className="chat-list-items">
          {chats.map((chat, index) => {
            const isLast = index === chats.length - 1;
            return (
              <div key={chat.channel_id} className="chat-list-item-wrapper">
                {swipedChatId === chat.channel_id && (
                  <>
                    <div className="chat-list-pin-action" onClick={() => handlePinChat(chat.channel_id)}><IconPinSwipe /></div>
                    <div className="chat-list-delete-action" onClick={() => { if (confirm('Delete this conversation? It will only be removed for you.')) handleDeleteChat(chat.channel_id); }}><IconDeleteSwipe /></div>
                  </>
                )}
                <div
                  ref={isLast ? lastChatRef : null}
                  className={`chat-list-item ${chat.isPinned ? 'pinned' : ''}`}
                  style={{ transform: swipedChatId === chat.channel_id ? 'translateX(-160px)' : 'translateX(0)', transition: 'transform 0.2s ease' }}
                  onClick={() => {
                    if (swipedChatId) { setSwipedChatId(null); return; }
                    if (onStartChat) onStartChat({ id: chat.other_user_id, full_name: chat.other_user_name, chatId: chat.channel_id });
                    if (onDeepScreen) onDeepScreen('chat');
                  }}
                  onTouchStart={(e) => handleTouchStart(e, chat.channel_id)}
                  onTouchEnd={(e) => handleTouchEnd(e, chat.channel_id)}
                >
                  <div className="chat-list-avatar" style={{ position: 'relative' }}>
                    {chat.other_user_pic ? <img src={chat.other_user_pic} alt="" /> : <div className="chat-list-avatar-placeholder"><IconAvatar /></div>}
                    {chat.has_unread && <span className="unread-dot"></span>}
                  </div>
                  <div className="chat-list-info">
                    <div className="chat-list-top">
                      <h3 style={{ fontWeight: chat.has_unread ? 600 : 400 }}>
                        {chat.other_user_name}
                        {chat.isPinned && <span className="pin-icon"><IconPin /></span>}
                      </h3>
                      <span className="chat-list-time">{formatTime(chat.last_message_at)}</span>
                    </div>
                    <p className="chat-list-preview" style={{ fontWeight: chat.has_unread ? 500 : 400 }}>{chat.last_message || ''}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {loadingMore && <div className="chat-list-loading-more"><div className="spinner"></div></div>}
        </div>
      )}
    </div>
  );
}

export default ChatListScreen;
