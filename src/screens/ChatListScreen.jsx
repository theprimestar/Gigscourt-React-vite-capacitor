import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { checkExpiredGigs } from '../gigSystem';
import '../Chat.css';

const CACHE_KEY = 'gigscourt_chatlist';

function getCachedChats() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedChats(chats) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(chats));
  } catch {}
}

const IconAvatar = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function ChatListScreen({ onStartChat, isVisible, onUnreadUpdate }) {
  const [chats, setChats] = useState(getCachedChats);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const cursorRef = useRef(null);
  const observerRef = useRef(null);
  const fetchingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const channelRef = useRef(null);
  const isMounted = useRef(true);
  const initialLoadDone = useRef(false);
  const initRan = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    if (isVisible && !initRan.current) {
      initRan.current = true;
      loadChatList(false);
    }
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      initRan.current = false;
      unsubscribeBroadcast();
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !currentUserId) {
      unsubscribeBroadcast();
      return;
    }

    const channel = supabase.channel(`user:${currentUserId}:chatlist`, {
      config: { broadcast: { self: false, ack: true } },
    });

    channel.on('broadcast', { event: 'chat_update' }, (payload) => {
      const update = payload?.payload;
      if (!update || !isMounted.current) return;

      setChats(prev => {
        const target = prev.find(c => c.channel_id === update.channel_id);
        const rest = prev.filter(c => c.channel_id !== update.channel_id);
        const updated = target
          ? {
              ...target,
              last_message: update.preview,
              last_message_at: update.timestamp,
              has_unread: true,
              unread_count: (target.unread_count || 0) + 1,
            }
          : null;
        const result = updated ? [updated, ...rest] : prev;
        setCachedChats(result);
        if (onUnreadUpdate) onUnreadUpdate();
        return result;
      });
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      unsubscribeBroadcast();
    };
  }, [isVisible, currentUserId]);

  useEffect(() => {
    const handleFocus = () => {
      if (isMounted.current && currentUserId && initialLoadDone.current && !fetchingRef.current) {
        loadChatList(false, true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUserId]);

  const unsubscribeBroadcast = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const loadChatList = async (append, silent = false) => {
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

      if (!isMounted.current || !data) return;

      const freshChats = data.filter(c => c.other_user_id);

      if (append) {
        setChats(prev => {
          const existingIds = new Set(prev.map(c => c.channel_id));
          const newOnes = freshChats.filter(c => !existingIds.has(c.channel_id));
          const result = [...prev, ...newOnes];
          setCachedChats(result);
          return result;
        });
      } else if (silent && initialLoadDone.current) {
        setChats(prev => {
          const merged = new Map(prev.map(c => [c.channel_id, c]));
          freshChats.forEach(c => {
            const existing = merged.get(c.channel_id);
            if (existing) {
              merged.set(c.channel_id, {
                ...c,
                has_unread: existing.has_unread || c.has_unread,
                unread_count: Math.max(existing.unread_count || 0, c.unread_count || 0),
              });
            } else {
              merged.set(c.channel_id, c);
            }
          });
          const result = [...merged.values()].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
          setCachedChats(result);
          return result;
        });
      } else {
        setChats(freshChats);
        setCachedChats(freshChats);
      }

      if (data.length > 0) {
        cursorRef.current = data[data.length - 1].last_message_at;
      }
      hasMoreRef.current = data.length === 30;
      setHasMore(data.length === 30);
      initialLoadDone.current = true;
      if (onUnreadUpdate) onUnreadUpdate();
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

  const lastChatRef = useCallback(
    (node) => {
      if (loadingMoreRef.current) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMoreRef.current) {
            loadMore();
          }
        },
        { rootMargin: '100px' }
      );
      if (node) observerRef.current.observe(node);
    },
    [loadMore]
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

  const filteredChats = searchQuery.trim()
    ? chats.filter(c =>
        c.other_user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  const isEmpty = chats.length === 0;
  const isSearchEmpty = searchQuery.trim() && filteredChats.length === 0 && chats.length > 0;

  return (
    <div className="chat-list-screen">
      <header className="chat-list-header">
        <h1>Chats</h1>
      </header>

      <div className="chat-list-search">
        <div className="chat-list-search-bar">
          <span className="chat-list-search-icon">
            <IconSearch />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            className="chat-list-search-input"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="chat-list-search-clear"
              aria-label="Clear search"
            >
              <IconClose />
            </button>
          )}
        </div>
      </div>

      {isEmpty && (
        <div className="chat-list-empty">
          <p className="chat-list-empty-title">No conversations yet</p>
          <p className="chat-list-empty-sub">Find a provider and start chatting!</p>
        </div>
      )}

      {isSearchEmpty && (
        <div className="chat-list-empty">
          <p className="chat-list-empty-title">No conversations match</p>
          <p className="chat-list-empty-sub">Try a different search term</p>
        </div>
      )}

      {!isEmpty && (
        <div className="chat-list-scroll">
          {filteredChats.map((chat, index) => {
            const isLast = index === filteredChats.length - 1;
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
                }}
              >
                <div className="chat-list-avatar">
                  {chat.other_user_pic ? (
                    <img src={chat.other_user_pic} alt="" />
                  ) : (
                    <div className="chat-list-avatar-placeholder">
                      <IconAvatar />
                    </div>
                  )}
                </div>

                <div className="chat-list-info">
                  <div className="chat-list-top">
                    <h3 className="chat-list-name">{chat.other_user_name}</h3>
                    <div className="chat-list-meta">
                      {chat.pending_gig && (
                        <span className="chat-list-pending-badge">Pending</span>
                      )}
                      <span className="chat-list-time">{formatTime(chat.last_message_at)}</span>
                    </div>
                  </div>
                  <div className="chat-list-bottom">
                    <p className="chat-list-preview">
                      {chat.last_message || ''}
                    </p>
                    {chat.has_unread && chat.unread_count > 0 && (
                      <span className="chat-list-unread">
                        {chat.unread_count > 99 ? '99+' : chat.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
