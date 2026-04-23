import React from 'react';
import { supabase } from '../lib/supabase';

function WelcomeScreen() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-icon">🎉</div>
        <h1>Welcome to GigsCourt!</h1>
        <p>Your account is all set up.</p>
        <p className="welcome-sub">Find local services, chat with providers, and get things done.</p>
        <button onClick={handleLogout} className="logout-button">
          Log Out
        </button>
      </div>
    </div>
  );
}

export default WelcomeScreen;
