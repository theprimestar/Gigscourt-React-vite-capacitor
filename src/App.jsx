import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { ensureFirebaseAuth } from './lib/firebase';
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import Onboarding from './screens/Onboarding';
import HomeScreen from './screens/HomeScreen';
import SearchScreen from './screens/SearchScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('loading');
  const [activeTab, setActiveTab] = useState('home');
  const [navStack, setNavStack] = useState([]);
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        try {
          await ensureFirebaseAuth(session.access_token);
          setFirebaseReady(true);
        } catch (err) {
          console.error('Firebase auth failed:', err);
        }
        determineScreen(session.user);
      } else {
        setScreen('auth');
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await ensureFirebaseAuth(session.access_token);
          setFirebaseReady(true);
        } catch (err) {
          console.error('Firebase auth failed:', err);
        }
        determineScreen(session.user);
      } else {
        setFirebaseReady(false);
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const determineScreen = async (user) => {
    if (!user.email_confirmed_at) {
      setScreen('verify');
      return;
    }

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

  const navigateTo = (screenType, data) => {
    setNavStack((prev) => [...prev, { screen: screenType, ...data }]);
  };

  const goBack = () => {
    setNavStack((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  };

  const currentDeepScreen = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const showBottomNav = screen === 'home' && navStack.length === 0;

  if (screen === 'loading' || (screen === 'home' && !firebaseReady)) {
    return (
      <div className="app">
        <div className="home-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
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
        {/* Home Tab */}
        <div style={{ display: activeTab === 'home' && !currentDeepScreen ? 'block' : 'none' }}>
          <HomeScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        </div>

        {/* Search Tab */}
        <div style={{ display: activeTab === 'search' && !currentDeepScreen ? 'block' : 'none' }}>
          <SearchScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        </div>

        {/* Chats Tab */}
        <div style={{ display: activeTab === 'chats' && !currentDeepScreen ? 'block' : 'none' }}>
          <ChatListScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
          />
        </div>

        {/* Profile Tab — own profile */}
        <div style={{ display: activeTab === 'profile' && !currentDeepScreen ? 'block' : 'none' }}>
          <ProfileScreen
            isOwn={true}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onEditProfile={() => navigateTo('editProfile')}
            onOpenSettings={() => navigateTo('settings')}
          />
        </div>

        {/* Deep Screen: Chat */}
        {currentDeepScreen?.screen === 'chat' && (
          <ChatScreen
            chatId={null}
            otherUserId={currentDeepScreen.userId}
            otherUserName={currentDeepScreen.userName}
            onBack={goBack}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        )}

        {/* Deep Screen: View Another User's Profile */}
        {currentDeepScreen?.screen === 'profile' && (
          <ProfileScreen
            userId={currentDeepScreen.userId}
            isOwn={false}
            onBack={goBack}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
          />
        )}

        {/* Deep Screen: Edit Profile */}
        {currentDeepScreen?.screen === 'editProfile' && (
          <EditProfileScreen onBack={goBack} />
        )}

        {/* Deep Screen: Settings */}
        {currentDeepScreen?.screen === 'settings' && (
          <SettingsScreen
            onBack={goBack}
            onLogout={async () => {
              await supabase.auth.signOut();
              setNavStack([]);
              setFirebaseReady(false);
              setScreen('auth');
            }}
          />
        )}
      </div>

      {showBottomNav && (
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
          <button
            className={`nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span className="nav-icon">👤</span>
            <span className="nav-label">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}

export default App;
