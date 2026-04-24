import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import Onboarding from './screens/Onboarding';
import HomeScreen from './screens/HomeScreen';
import SearchScreen from './screens/SearchScreen';
import ChatListScreen from './screens/ChatListScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('loading');
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        determineScreen(session.user);
      } else {
        setScreen('auth');
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        determineScreen(session.user);
      } else {
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const determineScreen = async (user) => {
    // Check email verification FIRST
    if (!user.email_confirmed_at) {
      setScreen('verify');
      return;
    }

    // Email is confirmed, check onboarding
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.onboarding_completed) {
      setScreen('home');
    } else {
      setScreen('onboarding');
    }
  };

  const handleOnboardingComplete = () => {
    setScreen('home');
  };

  if (screen === 'loading') {
    return (
      <div className="app">
        <p>Loading...</p>
      </div>
    );
  }

  if (screen === 'auth') {
    return (
      <div className="app">
        <AuthScreen onVerifyEmail={() => setScreen('verify')} />
      </div>
    );
  }

  if (screen === 'verify') {
    return (
      <div className="app">
        <VerifyEmailScreen onVerified={() => {
          const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email_confirmed_at) {
              determineScreen(user);
            }
          };
          checkUser();
        }} />
      </div>
    );
  }

  if (screen === 'onboarding') {
    return (
      <div className="app">
        <Onboarding onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-content">
  {activeTab === 'home' && <HomeScreen />}
  {activeTab === 'search' && <SearchScreen />}
  {activeTab === 'chats' && <ChatListScreen />}
</div>
      <nav className="bottom-nav">
        <button
          className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button
          className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <span className="nav-icon">🔍</span>
          <span className="nav-label">Search</span>
        </button>
        <button
  className={`nav-btn ${activeTab === 'chats' ? 'active' : ''}`}
  onClick={() => setActiveTab('chats')}
>
  <span className="nav-icon">💬</span>
  <span className="nav-label">Chats</span>
</button>
        <button className="nav-btn">
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
