import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { PUSH_NOTIFICATION_URL } from '../lib/config';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile, isVisible }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pinnedMessages, setPinnedMessages] = useState([]);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const channelRef = useRef(null);
  const channelIdRef = useRef(null);
  const seenIds = useRef(new Set());
  const isMounted = useRef(true);

  // Initialize chat
  useEffect(() => {
    isMounted.current = true;
    if (isVisible) {
      init();
    }

    return () => {
      isMounted.current = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, otherUserId, isVisible]);

  // Subscribe/unsubscribe when visibility changes
  useEffect(() => {
    if (!channelIdRef.current || !currentUserId) return;

    if (isVisible) {
      subscribeToChannel(channelIdRef.current);
    } else {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    }
  }, [isVisible, currentUserId]);

  const init = async () => {
    setError(null);
    setLoading(true);
    seenIds.current = new Set();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted.current) return;
      setCurrentUserId(user.id);

      // Get sender's name for push notifications
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (isMounted.current && myProfile) {
        setCurrentUserName(myProfile.full_name || '');
      }

      // Get or create the channel — database owns the ID, not the client
      let activeChannelId = chatId;

      if (!activeChannelId) {
        const { data: channelId } = await supabase.rpc('get_or_create_channel', {
          p_user_id: user.id,
          p_other_user_id: otherUserId,
        });
        activeChannelId = channelId;
      }

      if (!activeChannelId) {
        throw new Error('Could not create or find channel');
      }

      channelIdRef.current = activeChannelId;

      // Reset unread for this channel
      await supabase.rpc('reset_unread', {
        p_user_id: user.id,
        p_channel_id: activeChannelId,
      });

      // Fetch other user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, profile_pic_url, id, onesignal_player_id')
        .eq('id', otherUserId)
        .single();

      if (isMounted.current) {
        setOtherUser(profile || {
          full_name: otherUserName || 'User',
          profile_pic_url: null,
          id: otherUserId,
        });
      }

      // Fetch message history
      const { data: history } = await supabase.rpc('get_messages', {
        p_channel_id: activeChannelId,
        p_cursor: null,
        p_cursor_id: null,
        p_limit: 50,
      });

      if (isMounted.current && history) {
        const sorted = [...history].reverse();
        sorted.forEach(m => seenIds.current.add(m.id));
        setMessages(sorted);
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 100);
      }

      // Fetch pinned messages
      const { data: pins } = await supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('channel_id', activeChannelId);

      if (isMounted.current && pins) {
        setPinnedMessages(pins.map(p => p.message_id));
      }

      if (isMounted.current) setLoading(false);

      // Subscribe to realtime Broadcast
      subscribeToChannel(activeChannelId);

    } catch (err) {
      if (isMounted.current) setError(err.message);
      if (isMounted.current) setLoading(false);
    }
  };

  const subscribeToChannel = (channelId) => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
    }

    channelRef.current = supabase.channel(`chat:${channelId}`, {
      config: {
        broadcast: {
          self: true,
          ack: true,
        },
      },
    });

    channelRef.current.on(
      'broadcast',
      { event: 'message' },
      (payload) => {
        if (!isMounted.current) return;
        const msg = payload?.payload;
        if (!msg?.id || seenIds.current.has(msg.id)) return;

        seenIds.current.add(msg.id);

        switch (msg.type) {
          case 'new':
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            scrollToBottom();
            break;

          case 'edit':
            setMessages(prev =>
              prev.map(m => m.id === msg.id ? { ...m, text: msg.text, edited_at: msg.edited_at } : m)
            );
            break;

          case 'delete':
            setMessages(prev =>
              prev.map(m => m.id === msg.id ? { ...m, deleted_at: msg.deleted_at } : m)
            );
            break;

          case 'pin':
            setPinnedMessages(prev => [...prev, msg.message_id]);
            break;

          case 'unpin':
            setPinnedMessages(prev => prev.filter(id => id !== msg.message_id));
            break;
        }
      }
    );

    channelRef.current.subscribe((status) => {
      if (status === 'CLOSED') {
        setTimeout(() => {
          if (isMounted.current && isVisible) {
            subscribeToChannel(channelId);
          }
        }, 2000);
      }
    });
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || sending) return;

    const text = newMessage.trim();
    const channelId = channelIdRef.current;

    setNewMessage('');
    setSending(true);

    try {
      const { data: savedMessage } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_sender_id: currentUserId,
        p_other_user_id: otherUserId,
        p_text: text,
      });

      if (!savedMessage) throw new Error('Failed to send');

      const broadcastPayload = { ...savedMessage, type: 'new' };

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: broadcastPayload,
        }).catch(() => {});
      }

      // Push notification to other user
      if (otherUser?.onesignal_player_id) {
        const notificationHeading = currentUserName || otherUserName || 'New message';
        fetch(PUSH_NOTIFICATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            include_player_ids: [otherUser.onesignal_player_id],
            headings: { en: notificationHeading },
            contents: { en: text },
            data: { channel_id: channelId },
          }),
        }).catch(() => {});
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
        setNewMessage(text);
      }
    } finally {
      if (isMounted.current) setSending(false);
    }
  };

  const handleEditMessage = async (messageId) => {
    if (!editText.trim() || !currentUserId) return;

    const originalText = messages.find(m => m.id === messageId)?.text;
    setEditingMessageId(null);
    setEditText('');

    try {
      const { data: result } = await supabase.rpc('edit_message', {
        p_message_id: messageId,
        p_sender_id: currentUserId,
        p_new_text: editText.trim(),
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (channelRef.current && result) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: { ...result, type: 'edit' },
        }).catch(() => {});
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
        setMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, text: originalText } : m)
        );
      }
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const { data: result } = await supabase.rpc('delete_message', {
        p_message_id: messageId,
        p_sender_id: currentUserId,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            id: messageId,
            channel_id: channelIdRef.current,
            deleted_at: new Date().toISOString(),
            type: 'delete',
          },
        }).catch(() => {});
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const handlePinMessage = async (messageId) => {
    try {
      await supabase.rpc('pin_message', {
        p_channel_id: channelIdRef.current,
        p_message_id: messageId,
        p_user_id: currentUserId,
      });

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: { channel_id: channelIdRef.current, message_id: messageId, type: 'pin' },
        }).catch(() => {});
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const handleUnpinMessage = async (messageId) => {
    try {
      await supabase.rpc('unpin_message', {
        p_channel_id: channelIdRef.current,
        p_message_id: messageId,
        p_user_id: currentUserId,
      });

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'message',
          payload: { channel_id: channelIdRef.current, message_id: messageId, type: 'unpin' },
        }).catch(() => {});
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const handleDeleteConversation = async () => {
    if (!confirm('Delete this conversation? It will only be removed for you.')) return;

    try {
      const { data: result } = await supabase.rpc('delete_channel', {
        p_channel_id: channelIdRef.current,
        p_user_id: currentUserId,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (onBack) onBack();
    } catch (err) {
      if (isMounted.current) setError(err.message);
    }
  };

  const canEditMessage = (message) => {
    if (!message || message.sender_id !== currentUserId) return false;
    if (message.deleted_at) return false;
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    return (now - messageTime) < 10 * 60 * 1000;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="chat-screen">
        <div className="chat-loading"><div className="spinner"></div></div>
      </div>
    );
  }

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn">←</button>
        <div
          className="chat-header-info-tappable"
          onClick={() => {
            if (otherUser?.id && onViewProfile) {
              onViewProfile({ id: otherUser.id, full_name: otherUser.full_name });
            }
          }}
        >
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
        <button onClick={handleDeleteConversation} className="chat-delete-btn" title="Delete conversation">
          🗑️
        </button>
      </div>

      {error && (
        <div className="chat-error-banner" onClick={() => setError(null)}>
          <span>{error}</span>
          <button>✕</button>
        </div>
      )}

      <div className="chat-messages" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div className="chat-empty"><p>No messages yet. Say hello!</p></div>
        )}

        {messages.map(msg => {
          const isMine = msg.sender_id === currentUserId;
          const isPinned = pinnedMessages.includes(msg.id);
          const isDeleted = !!msg.deleted_at;
          const isEdited = !!msg.edited_at;

          return (
            <div key={msg.id} className={`message-row ${isMine ? 'message-mine' : 'message-other'}`}>
              {isPinned && (
                <div className="message-pin-indicator">📌 Pinned</div>
              )}

              <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'} ${isDeleted ? 'bubble-deleted' : ''}`}>
                {isDeleted ? (
                  <p className="message-text deleted-text">This message was deleted</p>
                ) : editingMessageId === msg.id ? (
                  <div className="message-edit-form">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="message-edit-input"
                      autoFocus
                    />
                    <button onClick={() => handleEditMessage(msg.id)} className="message-edit-save">✓</button>
                    <button onClick={() => { setEditingMessageId(null); setEditText(''); }} className="message-edit-cancel">✕</button>
                  </div>
                ) : (
                  <p className="message-text">{msg.text}</p>
                )}
                <span className="message-time">
                  {formatTime(msg.created_at)}
                  {isEdited && <span className="edited-label"> (edited)</span>}
                </span>
              </div>

              {isMine && !isDeleted && editingMessageId !== msg.id && (
                <div className="message-actions">
                  {canEditMessage(msg) && (
                    <button
                      className="message-action-btn"
                      onClick={() => { setEditingMessageId(msg.id); setEditText(msg.text); }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                  )}
                  <button
                    className="message-action-btn"
                    onClick={() => handleDeleteMessage(msg.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                  {isPinned ? (
                    <button
                      className="message-action-btn"
                      onClick={() => handleUnpinMessage(msg.id)}
                      title="Unpin"
                    >
                      📌❌
                    </button>
                  ) : (
                    <button
                      className="message-action-btn"
                      onClick={() => handlePinMessage(msg.id)}
                      title="Pin"
                    >
                      📌
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
          disabled={sending}
        />
        <button type="submit" disabled={!newMessage.trim() || sending} className="chat-send-btn">
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
