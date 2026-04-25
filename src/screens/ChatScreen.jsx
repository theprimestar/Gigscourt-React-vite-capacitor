import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
} from 'firebase/firestore';

function ChatScreen({ chatId, otherUserId, otherUserName, onBack, onViewProfile }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const chatDocRef = useRef(null);

  useEffect(() => {
    setupChat();
  }, [chatId, otherUserId]);

  const setupChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const chatIdToUse = chatId || [user.id, otherUserId].sort().join('_');
    chatDocRef.current = doc(db, 'chats', chatIdToUse);

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, profile_pic_url, id')
      .eq('id', otherUserId)
      .single();

    if (profile) {
      setOtherUser(profile);
    } else {
      setOtherUser({ full_name: otherUserName || 'User', profile_pic_url: null, id: otherUserId });
    }

    const messagesRef = collection(chatDocRef.current, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
      setLoading(false);
      scrollToBottom();
    });

    return () => unsubscribe();
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId) return;

    const messagesRef = collection(chatDocRef.current, 'messages');
    await addDoc(messagesRef, {
      text: newMessage.trim(),
      senderId: currentUserId,
      createdAt: serverTimestamp(),
    });

    await setDoc(chatDocRef.current, {
      participants: [currentUserId, otherUserId],
      lastMessage: newMessage.trim(),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: currentUserId,
    }, { merge: true });

    setNewMessage('');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleHeaderTap = () => {
    if (otherUser?.id && onViewProfile) {
      onViewProfile({ id: otherUser.id, full_name: otherUser.full_name });
    }
  };

  if (loading) {
    return (
      <div className="chat-screen">
        <div className="chat-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-screen">
      <div className="chat-header">
        <button onClick={onBack} className="chat-back-btn">←</button>
        <div className="chat-header-info-tappable" onClick={handleHeaderTap}>
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
        <span style={{ width: 40 }} />
      </div>

      <div className="chat-toast">
        <p>Did you complete a gig with {otherUser?.full_name?.split(' ')[0]}? <button className="chat-toast-btn">Register it now</button></p>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`message-row ${isMine ? 'message-mine' : 'message-other'}`}>
              <div className={`message-bubble ${isMine ? 'bubble-mine' : 'bubble-other'}`}>
                <p className="message-text">{msg.text}</p>
                <span className="message-time">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" disabled={!newMessage.trim()} className="chat-send-btn">
          ➤
        </button>
      </form>
    </div>
  );
}

export default ChatScreen;
