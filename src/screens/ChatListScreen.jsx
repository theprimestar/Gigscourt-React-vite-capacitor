import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { checkExpiredGigs } from '../gigSystem';
import { Haptics } from '@capacitor/haptics';
import '../Chat.css';

// Cache helpers
const CACHE_KEY = 'gigscourt_chatlist_cache';

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

// Bold SVG icons
const IconAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </svg>
);

const IconPin = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
  </svg>
);

const IconUnpin = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="4" x2="20" y2="20" />
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.14 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const IconDelete = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function ChatListScreen({ onStartChat, isVisible, onUnreadUpdate }) {
  // Instant cache load — no blank screen
  const [chats, setChats] = useState(getCachedChats);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [actionChat, setActionChat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const cursorRef = useRef(null);
  const observerRef = useRef(null);
  const fetchingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const longPressTimer = useRef(null);
  const channelRef = useRef(null);
  const isMounted = useRef(true);
  const initialLoadDone = useRef(false);

  // Mount
  useEffect(() => {
    isMounted.current = true;
    loadChatList(false);
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Broadcast: only when tab is visible
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
        // Notify App.jsx to refresh badge
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

  // Window focus — silent background refresh with merge (not replace)
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);
      checkExpiredGigs(user.id);

      const [{ data }, { data: pinnedData }] = await Promise.all([
        supabase.rpc('get_chat_list', {
          p_user_id: user.id,
          p_limit: 30,
          p_cursor: append ? cursorRef.current : null,
        }),
        supabase
          .from('channel_members')
          .select('channel_id')
          .eq('user_id', user.id)
          .not('pinned_at', 'is', null),
      ]);

      if (!isMounted.current || !data) return;

      const pinnedIds = new Set((pinnedData || []).map(p => p.channel_id));
      const seen = new Set();
      const freshChats = data
        .filter(c => c.other_user_id && !seen.has(c.channel_id) && seen.add(c.channel_id))
        .map(c => ({ ...c, isPinned: pinnedIds.has(c.channel_id) }));

      if (append) {
        // Merge: add new conversations, don't duplicate
        setChats(prev => {
          const existingIds = new Set(prev.map(c => c.channel_id));
          const newOnes = freshChats.filter(c => !existingIds.has(c.channel_id));
          return [...prev, ...newOnes];
        });
      } else if (silent && initialLoadDone.current) {
        // Silent merge: update existing conversations in-place, add new ones
        setChats(prev => {
          const merged = new Map(prev.map(c => [c.channel_id, c]));
          freshChats.forEach(c => {
            const existing = merged.get(c.channel_id);
            if (existing) {
              // Preserve local pin state, update the rest
              merged.set(c.channel_id, {
                ...c,
                isPinned: existing.isPinned,
                has_unread: existing.has_unread || c.has_unread,
                unread_count: Math.max(existing.unread_count || 0, c.unread_count || 0),
              });
            } else {
              merged.set(c.channel_id, c);
            }
          });
          return [...merged.values()];
        });
      } else {
        // Initial load: use fresh data, but preserve any local pinned chats
        setChats(prev => {
          const localMap = new Map(prev.map(c => [c.channel_id, c]));
          const freshMap = new Map(freshChats.map(c => [c.channel_id, c]));
          // Keep locally pinned chats that aren't in fresh data
          localMap.forEach((c, id) => {
            if (c.isPinned && !freshMap.has(id)) {
              freshMap.set(id, c);
            }
          });
          return [...freshMap.values()].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
          });
        });
      }

      setCachedChats(chats);
      if (data.length > 0) {
        cursorRef.current = data[data.length - 1].last_message_at;
      }
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

  const lastChatRef = useCallback(
    node => {
      if (loadingMoreRef.current) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        entries => {
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

  const triggerHaptic = async () => {
    try {
      await Haptics.impact({ style: 'MEDIUM' });
    } catch {}
  };

  // Long press
  const handleLongPress = useCallback(
    async (e, chat) => {
      e.preventDefault();
      if (actionChat?.channel_id === chat.channel_id) {
        setActionChat(null);
        return;
      }
      await triggerHaptic();
      setActionChat(chat);
    },
    [actionChat]
  );

  // Tap — navigate
  const handleTap = useCallback(
    chat => {
      if (actionChat) return;
      if (onStartChat) {
        onStartChat({
          id: chat.other_user_id,
          full_name: chat.other_user_name,
          chatId: chat.channel_id,
        });
      }
    },
    [onStartChat, actionChat]
  );

  const handleDismissOverlay = useCallback(() => {
    setActionChat(null);
  }, []);

  // Pin / Unpin — instant UI + background DB update + cache save
  const handleTogglePin = async channelId => {
    if (!currentUserId) return;
    const chat = chats.find(c => c.channel_id === channelId);
    const isPinned = !!chat?.isPinned;

    // 1. Update UI instantly
    const updater = prev => {
      const updated = prev.map(c =>
        c.channel_id === channelId ? { ...c, isPinned: !isPinned } : c
      );
      return [...updated].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
      });
    };
    setChats(updater);
    setActionChat(prev =>
      prev?.channel_id === channelId ? { ...prev, isPinned: !isPinned } : prev
    );

    // 2. Update cache immediately
    const currentChats = getCachedChats();
    const cachedUpdated = currentChats.map(c =>
      c.channel_id === channelId ? { ...c, isPinned: !isPinned } : c
    );
    setCachedChats(cachedUpdated);

    // 3. Database update in background
    try {
      await supabase
        .from('channel_members')
        .update({ pinned_at: isPinned ? null : new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', currentUserId);
    } catch (err) {
      // Revert on failure
      console.error('Pin toggle failed:', err);
      setChats(prev => {
        const reverted = prev.map(c =>
          c.channel_id === channelId ? { ...c, isPinned } : c
        );
        setCachedChats(reverted);
        return reverted;
      });
    }
  };

  // Delete — instant removal + background DB update + cache save
  const handleDeleteChat = async channelId => {
    if (!currentUserId) return;

    // 1. Remove from UI instantly
    setChats(prev => {
      const result = prev.filter(c => c.channel_id !== channelId);
      setCachedChats(result);
      return result;
    });
    setActionChat(null);

    // 2. Database update in background
    try {
      await supabase
        .from('channel_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', currentUserId);
    } catch (err) {
      // Revert on failure — refetch to restore
      console.error('Delete failed:', err);
      loadChatList(false);
    }
  };

  const formatTime = timestamp => {
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
    ? chats.filter(c => {
        const q = searchQuery.toLowerCase();
        return (
          c.other_user_name?.toLowerCase().includes(q) ||
          c.last_message?.toLowerCase().includes(q)
        );
      })
    : chats;

  const isEmpty = chats.length === 0;
  const isSearchEmpty = searchQuery.trim() && filteredChats.length === 0 && chats.length > 0;

  return (
    <div className="chat-list-screen">
      <header className="chat-list-header">
        <h1>Chats</h1>
      </header>

      <div className="chat-list-search">
        <div className="chat-list-search-input-wrapper">
          <span className="chat-list-search-icon">
            <IconSearch />
          </span>
          <input
            type="text"
            className="chat-list-search-input"
            placeholder="Search chats"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search conversations"
          />
          {searchQuery && (
            <button
              className="chat-list-search-clear"
              onClick={() => setSearchQuery('')}
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
            const isActionTarget = actionChat?.channel_id === chat.channel_id;
            const isDimmed = actionChat !== null && !isActionTarget;

            return (
              <div
                key={chat.channel_id}
                className={`chat-list-item-wrapper ${isActionTarget ? 'has-actions' : ''}`}
              >
                <div
                  ref={isLast ? lastChatRef : null}
                  className={`chat-list-item ${chat.isPinned ? 'pinned' : ''} ${
                    isActionTarget ? 'highlighted' : ''
                  } ${isDimmed ? 'dimmed' : ''}`}
                  onClick={() => handleTap(chat)}
                  onContextMenu={e => handleLongPress(e, chat)}
                  onTouchStart={e => {
                    longPressTimer.current = setTimeout(() => {
                      handleLongPress(e, chat);
                    }, 500);
                  }}
                  onTouchEnd={() => clearTimeout(longPressTimer.current)}
                  onTouchMove={() => clearTimeout(longPressTimer.current)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Conversation with ${chat.other_user_name}`}
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
                      <h3 className="chat-list-name">
                        {chat.other_user_name}
                        {chat.isPinned && (
                          <span className="pin-icon">
                            <IconPin />
                          </span>
                        )}
                      </h3>
                      <span className="chat-list-time">
                        {chat.pending_gig && (
                          <span className="pending-gig-badge">Pending</span>
                        )}
                        {formatTime(chat.last_message_at)}
                      </span>
                    </div>
                    <div className="chat-list-bottom">
                      <p className="chat-list-preview">
                        {chat.last_message || ''}
                      </p>
                      {chat.has_unread && chat.unread_count > 0 && (
                        <span className="unread-badge">
                          {chat.unread_count > 99 ? '99+' : chat.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isActionTarget && (
                  <div className="chat-list-actions">
                    <button
                      className="chat-list-action-btn"
                      onClick={() => handleTogglePin(chat.channel_id)}
                    >
                      <span>{chat.isPinned ? 'Unpin' : 'Pin'}</span>
                      {chat.isPinned ? <IconUnpin /> : <IconPin />}
                    </button>
                    <button
                      className="chat-list-action-btn danger"
                      onClick={() => handleDeleteChat(chat.channel_id)}
                    >
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

      {actionChat && (
        <div
          className="chat-list-dismiss-overlay"
          onClick={handleDismissOverlay}
          onTouchStart={e => {
            e.preventDefault();
            e.stopPropagation();
            handleDismissOverlay();
          }}
          onContextMenu={e => e.preventDefault()}
        />
      )}
    </div>
  );
}
