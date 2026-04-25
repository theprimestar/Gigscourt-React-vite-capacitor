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
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        try {
          await ensureFirebaseAuth(session.access_token);
          setFirebaseReady(true);
        } catch (err) {
          console.error('Firebase auth failed:', err);
          setInitError('Firebase auth: ' + (err.message || 'Unknown error'));
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
          setInitError('Firebase auth: ' + (err.message || 'Unknown error'));
        }
        determineScreen(session.user);
      } else {
        setFirebaseReady(false);
        setInitError(null);
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

    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      setInitError('Supabase profile check: ' + error.message);
      return;
    }

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

  if (screen === 'loading' || (screen === 'home' && !firebaseReady && !initError)) {
    return (
      <div className="app">
        <div className="home-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="app">
        <div className="home-empty" style={{ padding: 40 }}>
          <p style={{ color: '#ff3b30', fontWeight: 600, marginBottom: 8 }}>Startup Error</p>
          <p style={{ fontSize: 13, color: '#8e8e93', wordBreak: 'break-word' }}>{initError}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '12px 24px',
              background: '#007aff',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
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
        <div style={{ display: activeTab === 'home' && !currentDeepScreen ? 'block' : 'none' }}>
          <HomeScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        </div>

        <div style={{ display: activeTab === 'search' && !currentDeepScreen ? 'block' : 'none' }}>
          <SearchScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        </div>

        <div style={{ display: activeTab === 'chats' && !currentDeepScreen ? 'block' : 'none' }}>
          <ChatListScreen
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
          />
        </div>

        <div style={{ display: activeTab === 'profile' && !currentDeepScreen ? 'block' : 'none' }}>
          <ProfileScreen
            isOwn={true}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onEditProfile={() => navigateTo('editProfile')}
            onOpenSettings={() => navigateTo('settings')}
          />
        </div>

        {currentDeepScreen?.screen === 'chat' && (
          <ChatScreen
            chatId={null}
            otherUserId={currentDeepScreen.userId}
            otherUserName={currentDeepScreen.userName}
            onBack={goBack}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
          />
        )}

        {currentDeepScreen?.screen === 'profile' && (
          <ProfileScreen
            userId={currentDeepScreen.userId}
            isOwn={false}
            onBack={goBack}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
          />
        )}

        {currentDeepScreen?.screen === 'editProfile' && (
          <EditProfileScreen onBack={goBack} />
        )}

        {currentDeepScreen?.screen === 'settings' && (
          <SettingsScreen
            onBack={goBack}
            onLogout={async () => {
              await supabase.auth.signOut();
              setNavStack([]);
              setFirebaseReady(false);
              setInitError(null);
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
