import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function VerifyEmailScreen({ onVerified }) {
  const [checking, setChecking] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const intervalRef = useRef(null);
  const attemptsRef = useRef(0);
  const maxAttempts = 120; // 10 minutes

  useEffect(() => {
    checkVerification();
    intervalRef.current = setInterval(checkVerification, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const checkVerification = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email_confirmed_at) {
        setChecking(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        onVerified();
        return;
      }

      attemptsRef.current++;
      if (attemptsRef.current >= maxAttempts) {
        setChecking(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch (err) {
      console.error('Error checking verification:', err);
      attemptsRef.current++;
      if (attemptsRef.current >= maxAttempts) {
        setChecking(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || resendLoading) return;

    setResendLoading(true);
    setResendMessage('');

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: '', // Supabase uses the email from the current session
      });

      if (error) throw error;

      setResendMessage('Email resent! Check your inbox.');
      setResendCountdown(60);
      attemptsRef.current = 0; // Reset attempts so polling continues
      setChecking(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(checkVerification, 5000);
    } catch (err) {
      setResendMessage(err.message || 'Failed to resend. Try again.');
    } finally {
      setResendLoading(false);
    }
  };

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
          </div>
        )}

        <div className="resend-section">
          <button
            onClick={handleResend}
            disabled={resendCountdown > 0 || resendLoading}
            className="resend-button"
          >
            {resendLoading ? 'Sending...' : resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Email'}
          </button>
          {resendMessage && (
            <p className={`resend-message ${resendMessage.includes('resent') ? 'success' : ''}`}>
              {resendMessage}
            </p>
          )}
        </div>

        <button onClick={() => window.location.reload()} className="retry-button" style={{ marginTop: 12 }}>
          Check Again
        </button>
      </div>
    </div>
  );
}

export default VerifyEmailScreen;
