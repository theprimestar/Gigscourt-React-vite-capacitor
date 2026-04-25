import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import ChatScreen from './ChatScreen';

function ChatListScreen({ chatTarget, onClearChatTarget }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profiles, setProfiles] = useState({});

  useEffect(() => {
    setupChats();
  }, []);

  const setupChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    // Handle chatTarget if present — must happen after we have user.id
    if (chatTarget && user.id) {
      const chatId = [user.id, chatTarget.id].sort().join('_');
      setActiveChat({
        id: chatId,
        participants: [user.id, chatTarget.id],
      });
      if (onClearChatTarget) onClearChatTarget();
    }

    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('participants', 'array-contains', user.id),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const otherUserIds = chatList.map((chat) =>
        chat.participants.find((p) => p !== user.id)
      );

      if (otherUserIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, profile_pic_url')
          .in('id', otherUserIds);

        const profileMap = {};
        if (profileData) {
          profileData.forEach((p) => {
            profileMap[p.id] = p;
          });
        }
        setProfiles(profileMap);
      }

      setChats(chatList);
      setLoading(false);
    });

    return () => unsubscribe();
  };

  const getOtherUser = (chat) => {
    const otherId = chat.participants.find((p) => p !== currentUserId);
    return profiles[otherId] || { full_name: 'User', profile_pic_url: null };
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString();
  };

  if (activeChat) {
    const otherUser = getOtherUser(activeChat);
    return (
      <ChatScreen
        chatId={activeChat.id}
        otherUserId={activeChat.participants.find((p) => p !== currentUserId)}
        otherUserName={otherUser.full_name}
        onBack={() => setActiveChat(null)}
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
          {chats.map((chat) => {
            const other = getOtherUser(chat);
            return (
              <div
                key={chat.id}
                className="chat-list-item"
                onClick={() => setActiveChat(chat)}
              >
                <div className="chat-list-avatar">
                  {other.profile_pic_url ? (
                    <img src={other.profile_pic_url} alt="" />
                  ) : (
                    <div className="chat-list-avatar-placeholder">👤</div>
                  )}
                </div>
                <div className="chat-list-info">
                  <div className="chat-list-top">
                    <h3>{other.full_name}</h3>
                    <span className="chat-list-time">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <p className="chat-list-preview">{chat.lastMessage || ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ChatListScreen;
