import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import Onboarding from './screens/Onboarding';
import HomeScreen from './screens/HomeScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('loading');

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        checkOnboarding(session.user.id);
      } else {
        setScreen('auth');
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkOnboarding(session.user.id);
      } else {
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkOnboarding = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .single();

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
        <VerifyEmailScreen onVerified={() => setScreen('onboarding')} />
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
    <HomeScreen />
  );
}

export default App;
