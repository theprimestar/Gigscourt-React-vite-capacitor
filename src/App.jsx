import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('loading');

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setScreen('welcome');
      } else {
        setScreen('auth');
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setScreen('welcome');
      } else {
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
        <VerifyEmailScreen onVerified={() => setScreen('welcome')} />
      </div>
    );
  }

  return (
    <div className="app">
      <WelcomeScreen />
    </div>
  );
}

export default App;
