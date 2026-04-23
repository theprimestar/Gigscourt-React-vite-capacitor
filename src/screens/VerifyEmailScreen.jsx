import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function VerifyEmailScreen({ onVerified }) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let interval;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes (5s intervals)

    const checkVerification = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user?.email_confirmed_at) {
          setChecking(false);
          onVerified();
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          setChecking(false);
        }
      } catch (err) {
        console.error('Error checking verification:', err);
        attempts++;
        if (attempts >= maxAttempts) {
          setChecking(false);
        }
      }
    };

    // Check immediately
    checkVerification();

    // Then poll every 5 seconds
    interval = setInterval(checkVerification, 5000);

    return () => clearInterval(interval);
  }, [onVerified]);

  return (
    <div className="verify-screen">
      <div className="verify-card">
        <div className="verify-icon">📧</div>
        <h2>Check Your Email</h2>
        <p>We sent a verification link to your email address.</p>
        <p className="verify-sub">Open the link, then come back here — you'll be logged in automatically.</p>

        {checking ? (
          <div className="verify-loading">
            <div className="spinner"></div>
            <p>Waiting for verification...</p>
          </div>
        ) : (
          <div className="verify-timeout">
            <p>Verification is taking longer than expected.</p>
            <button onClick={() => window.location.reload()} className="retry-button">
              Check Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailScreen;
