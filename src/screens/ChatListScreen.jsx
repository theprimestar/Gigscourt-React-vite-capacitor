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
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </svg>
);

const IconDelete = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconUnpin = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="4" x2="20" y2="20"/><path d="M12 2l3.09 6.26L22 9.27l-5 4.14 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const CACHE_KEY = 'gigscourt_chatlist_cache';

function getCachedChats() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch { return []; } }
function setCachedChats(chats) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(chats)); } catch {} }

function ChatListScreen({ chatTarget, onClearChatTarget, onDeepScreen, onStartChat, isVisible }) {
  const [chats, setChats] = useState(getCachedChats);
  const [hasMore, setHasMore] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [actionChat, setActionChat] = useState(null);

  const cursorRef = useRef(null);
  const observerRef = useRef(null);
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);
  const initialLoadDone = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const longPressTimer = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    loadChatList(false);
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isVisible || !currentUserId) {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`user:${currentUserId}:chatlist`, {
      config: { broadcast: { self: false, ack: true } },
    });

    channel.on('broadcast', { event: 'chat_update' }, (payload) => {
      const update = payload?.payload;
      if (!update) return;

      setChats(prev => {
        const updated = prev.map(c =>
          c.channel_id === update.channel_id
            ? { ...c, last_message: update.preview, last_message_at: update.timestamp, has_unread: true, unread_count: (c.unread_count || 0) + 1 }
            : c
        );
        const target = updated.find(c => c.channel_id === update.channel_id);
        const rest = updated.filter(c => c.channel_id !== update.channel_id);
        const result = target ? [target, ...rest] : updated;
        setCachedChats(result);
        return result;
      });
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isVisible, currentUserId]);

  useEffect(() => {
    if (chatTarget && currentUserId && onStartChat) {
      onStartChat({ id: chatTarget.id, full_name: chatTarget.userName || 'User', chatId: chatTarget.channel_id || null });
      if (onClearChatTarget) onClearChatTarget();
      if (onDeepScreen) onDeepScreen('chat');
    }
  }, [chatTarget, currentUserId]);

  useEffect(() => {
    const handleFocus = () => {
      if (isMounted.current && currentUserId && !fetchingRef.current) {
        cursorRef.current = null;
        hasMoreRef.current = true;
        setHasMore(true);
        loadChatList(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUserId]);

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

      if (!isMounted.current || !data) return;

      const pinnedIds = new Set((pinnedData || []).map(p => p.channel_id));
      const seen = new Set();
      const validChats = data
        .filter(c => c.other_user_id && !seen.has(c.channel_id) && seen.add(c.channel_id))
        .map(c => ({ ...c, isPinned: pinnedIds.has(c.channel_id) }));

      const sorted = [...validChats].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });

      if (append) {
        setChats(prev => {
          const existingIds = new Set(prev.map(c => c.channel_id));
          const result = [...prev, ...sorted.filter(c => !existingIds.has(c.channel_id))];
          setCachedChats(result);
          return result;
        });
      } else {
        setChats(sorted);
        setCachedChats(sorted);
      }

      if (data.length > 0) cursorRef.current = data[data.length - 1].last_message_at;
      hasMoreRef.current = data.length === 30;
      setHasMore(data.length === 30);
      initialLoadDone.current = true;
    } catch (err) {
      console.error('Chat list error:', err);
    } finally {
      loadingMoreRef.current = false;
      fetchingRef.current = false;
    }
  };

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current || !currentUserId) return;
    loadingMoreRef.current = true;
    loadChatList(true);
  }, [currentUserId]);

  const lastChatRef = useCallback((node) => {
    if (loadingMoreRef.current) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current) loadMore();
    });
    if (node) observerRef.current.observe(node);
  }, []);

  const handleDeleteChat = async (channelId) => {
    if (!currentUserId) return;
    await supabase.from('channel_members').update({ deleted_at: new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', currentUserId);
    setChats(prev => { const result = prev.filter(c => c.channel_id !== channelId); setCachedChats(result); return result; });
    setActionChat(null);
  };

  const handlePinChat = async (channelId) => {
    if (!currentUserId) return;
    const chat = chats.find(c => c.channel_id === channelId);
    const isPinned = !!chat?.isPinned;
    await supabase.from('channel_members').update({ pinned_at: isPinned ? null : new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', currentUserId);
    setChats(prev => { const result = prev.map(c => c.channel_id === channelId ? { ...c, isPinned: !isPinned } : c); setCachedChats(result); return result; });
    setActionChat(null);
  };

  const handleLongPress = (e, chat) => {
    e.preventDefault();
    setActionChat(actionChat?.channel_id === chat.channel_id ? null : chat);
  };

  const handleTap = (chat) => {
    setActionChat(null);
    if (onStartChat) onStartChat({ id: chat.other_user_id, full_name: chat.other_user_name, chatId: chat.channel_id });
    if (onDeepScreen) onDeepScreen('chat');
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

      {chats.length === 0 ? (
        <div className="chat-list-empty">
          <p>No conversations yet</p>
          <p className="chat-list-empty-sub">Find a provider and start chatting!</p>
        </div>
      ) : (
        <div className="chat-list-items">
          {chats.map((chat, index) => {
            const isLast = index === chats.length - 1;
            const isActive = actionChat?.channel_id === chat.channel_id;

            return (
              <div key={chat.channel_id}>
                <div
                  ref={isLast ? lastChatRef : null}
                  className={`chat-list-item ${chat.isPinned ? 'pinned' : ''} ${isActive ? 'highlighted' : ''}`}
                  style={actionChat && !isActive ? { opacity: 0.3 } : {}}
                  onContextMenu={(e) => handleLongPress(e, chat)}
                  onTouchStart={(e) => { longPressTimer.current = setTimeout(() => handleLongPress(e, chat), 500); }}
                  onTouchEnd={() => clearTimeout(longPressTimer.current)}
                  onTouchMove={() => clearTimeout(longPressTimer.current)}
                  onClick={() => handleTap(chat)}
                >
                  <div className="chat-list-avatar">
                    {chat.other_user_pic ? (
                      <img src={chat.other_user_pic} alt="" />
                    ) : (
                      <div className="chat-list-avatar-placeholder"><IconAvatar /></div>
                    )}
                  </div>
                  <div className="chat-list-info">
                    <div className="chat-list-top">
                      <h3>
                        {chat.other_user_name}
                        {chat.isPinned && <span className="pin-icon"><IconPin /></span>}
                      </h3>
                      <span className="chat-list-time">
                        {chat.pending_gig && <span className="pending-gig-label">Pending gig</span>}
                        {formatTime(chat.last_message_at)}
                      </span>
                    </div>
                    <div className="chat-list-bottom">
                      <p className="chat-list-preview">{chat.last_message || ''}</p>
                      {chat.has_unread && chat.unread_count > 0 && (
                        <span className="unread-badge">{chat.unread_count > 99 ? '99+' : chat.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>

                {isActive && (
                  <div className="chat-list-actions">
                    <button className="chat-list-action-btn" onClick={() => handlePinChat(chat.channel_id)}>
                      <span>{chat.isPinned ? 'Unpin' : 'Pin'}</span>
                      {chat.isPinned ? <IconUnpin /> : <IconPin />}
                    </button>
                    <button className="chat-list-action-btn danger" onClick={() => { if (confirm('Delete this conversation? It will only be removed for you.')) handleDeleteChat(chat.channel_id); }}>
                      <span>Delete</span>
                      <IconDelete />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ChatListScreen;
