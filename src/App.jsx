import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { initOneSignal, getOneSignalUserId } from './lib/onesignal';
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
import AdminScreen from './screens/AdminScreen';
import Logo from './Logo';
import './App.css';
import './SplashScreen.css';

// ── Premium SVG Navigation Icons ──
const IconHome = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconSearch = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconChats = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconProfile = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);

const IconAdmin = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

function App() {
  const [screen, setScreen] = useState('splash');
  const [activeTab, setActiveTab] = useState('home');
  const [navStack, setNavStack] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [navVisible, setNavVisible] = useState(true);
  const splashTimerRef = useRef(null);
  const screenRef = useRef(screen);
  const lastScrollY = useRef(0);
  screenRef.current = screen;

  useEffect(() => {
    initApp();
    return () => {
      if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    };
  }, []);

  // Auto-hide nav on scroll (only on Home and Search tabs)
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'search') {
      setNavVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentY = window.scrollY || document.querySelector('.home-screen')?.scrollTop || 0;
      if (currentY > lastScrollY.current && currentY > 80) {
        setNavVisible(false);
      } else {
        setNavVisible(true);
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  const initApp = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      registerOneSignal(session.user.id);
      setIsAdmin(session.user?.email === 'theprimestarventures@gmail.com');
      navigateFromSession(session.user);
    }

    splashTimerRef.current = setTimeout(() => {
      if (!session?.user) {
        setScreen('auth');
      }
    }, 1500);
  };

  const navigateFromSession = async (user) => {
    if (!user.email_confirmed_at) {
      finishSplash('verify');
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.onboarding_completed) {
      finishSplash('app');
    } else {
      finishSplash('onboarding');
    }
  };

  const finishSplash = (targetScreen) => {
    if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    splashTimerRef.current = setTimeout(() => {
      setScreen(targetScreen);
    }, 1500);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        registerOneSignal(session.user.id);
        setIsAdmin(session.user?.email === 'theprimestarventures@gmail.com');
        if (screenRef.current === 'auth' || screenRef.current === 'splash') {
          navigateFromSession(session.user);
        }
      } else if (screenRef.current === 'app') {
        setScreen('auth');
        setNavStack([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const registerOneSignal = async (userId) => {
    try {
      initOneSignal((notification) => {
        checkUnreadBadge();
        const data = notification?.data || {};

        if (data.channel_id) {
          const otherId = data.channel_id.split(':').find(id => id !== userId);
          navigateTo('chat', {
            userId: otherId,
            userName: '',
            chatId: data.channel_id,
          });
          setActiveTab('chats');
        } else if (data.screen === 'settings') {
          setActiveTab('profile');
          setTimeout(() => navigateTo('settings'), 100);
        } else if (data.screen === 'home') {
          setActiveTab('home');
        } else if (data.screen === 'profile') {
          setActiveTab('profile');
        } else {
          setActiveTab('chats');
        }
      });

      const playerId = await getOneSignalUserId();
      if (!playerId) return;

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (existingProfile) {
        await supabase
          .from('profiles')
          .update({
            onesignal_player_id: playerId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
      } else {
        await supabase
          .from('profiles')
          .insert({
            id: userId,
            onesignal_player_id: playerId,
            updated_at: new Date().toISOString(),
          });
      }
    } catch (err) {
      console.warn('OneSignal registration:', err.message);
    }
  };

  const handleOnboardingComplete = () => {
    setScreen('app');
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

  const checkUnreadBadge = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.rpc('get_unread_count', { p_user_id: user.id });
    if (data !== null) setUnreadCount(data);
  }, []);

  useEffect(() => {
    if (screen === 'app') {
      checkUnreadBadge();
      import('./gigSystem').then(({ checkExpiredGigs }) => {
        supabase.auth.getUser().then(({ data }) => {
          if (data?.user) checkExpiredGigs(data.user.id);
        });
      });
    }
  }, [screen, activeTab, checkUnreadBadge]);

  const currentDeepScreen = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const showBottomNav = screen === 'app' && navStack.length === 0;

  if (screen === 'splash') {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <Logo />
        </div>
      </div>
    );
  }

  if (screen === 'auth') {
    return (
      <div className="app">
        <AuthScreen onVerifyEmail={(email) => {
          setVerifyEmail(email);
          setScreen('verify');
        }} />
      </div>
    );
  }

  if (screen === 'verify') {
    return (
      <div className="app">
        <VerifyEmailScreen 
          email={verifyEmail}
          onVerified={async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              navigateFromSession(user);
            }
          }} 
        />
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
            isVisible={activeTab === 'chats' && !currentDeepScreen}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name, chatId: user.chatId || null })}
            onUnreadUpdate={checkUnreadBadge}
          />
        </div>

        <div style={{ display: activeTab === 'profile' && !currentDeepScreen ? 'block' : 'none' }}>
          <ProfileScreen
            isOwn={true}
            isVisible={activeTab === 'profile' && !currentDeepScreen}
            onStartChat={(user) => navigateTo('chat', { userId: user.id, userName: user.full_name })}
            onEditProfile={() => navigateTo('editProfile')}
            onOpenSettings={() => navigateTo('settings')}
          />
        </div>

        {isAdmin && (
          <div style={{ display: activeTab === 'admin' && !currentDeepScreen ? 'block' : 'none' }}>
            <AdminScreen isVisible={activeTab === 'admin' && !currentDeepScreen} />
          </div>
        )}

        {currentDeepScreen?.screen === 'chat' && (
          <ChatScreen
            chatId={currentDeepScreen.chatId || null}
            otherUserId={currentDeepScreen.userId}
            otherUserName={currentDeepScreen.userName}
            onBack={goBack}
            onViewProfile={(user) => navigateTo('profile', { userId: user.id })}
            isVisible={currentDeepScreen?.screen === 'chat'}
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
              setScreen('auth');
            }}
          />
        )}
      </div>

      {showBottomNav && (
        <nav className={`bottom-nav ${navVisible ? 'visible' : 'hidden'}`}>
          <button
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <IconHome filled={activeTab === 'home'} />
          </button>
          <button
            className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <IconSearch filled={activeTab === 'search'} />
          </button>
          <button
            className={`nav-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            <span className="nav-icon-wrapper">
              <IconChats filled={activeTab === 'chats'} />
              {unreadCount > 0 && (
                <span className="nav-unread-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          </button>
          <button
            className={`nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <IconProfile filled={activeTab === 'profile'} />
          </button>
          {isAdmin && (
            <button
              className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <IconAdmin filled={activeTab === 'admin'} />
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

export default App;
