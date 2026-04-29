import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import '../Auth.css';

function VerifyEmailScreen({ email, onVerified }) {
  const [code, setCode] = useState(['', '', '', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [userEmail, setUserEmail] = useState(email || '');
  const inputRefs = useRef([]);
  const navigatingRef = useRef(false);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const getErrorMessage = (err) => {
    const msg = err.message || '';
    if (msg.includes('expired') || msg.includes('Token has expired')) {
      return 'This code has expired. Request a new one.';
    }
    if (msg.includes('Invalid') || msg.includes('invalid')) {
      return 'Incorrect code. Please check your email and try again.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'No internet connection. Check your signal and try again.';
    }
    if (msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    return 'Verification failed. Please try again.';
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === 7) {
      const fullCode = newCode.join('');
      if (fullCode.length === 8) {
        verifyCode(fullCode);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
    if (pasted.length === 8) {
      const newCode = pasted.split('');
      setCode(newCode);
      verifyCode(newCode.join(''));
    }
  };

  const verifyCode = async (fullCode) => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: fullCode,
        type: 'signup',
      });

      if (error) throw error;

      if (data?.user) {
        navigatingRef.current = true;
        await supabase.auth.refreshSession();
        onVerified();
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setCode(['', '', '', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      if (!navigatingRef.current) {
        setLoading(false);
      }
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || resendLoading) return;

    setResendLoading(true);
    setResendMessage('');
    setError('');

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail,
      });

      if (error) throw error;

      setResendMessage('A new code has been sent to your email.');
      setResendCountdown(60);
    } catch (err) {
      setResendMessage(err.message || 'Failed to resend. Try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="verify-screen">
      <div className="verify-card">
        <div className="verify-icon">✉</div>
        <h2>Verify Your Email</h2>
        <p>We sent an 8-digit code to</p>
        <p className="verify-email">{userEmail || 'your email'}</p>
        <p className="verify-sub">Enter the code below to continue.</p>

        <div className="otp-inputs" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={`otp-input ${error ? 'otp-input-error' : ''}`}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {loading && (
          <div className="verify-loading">
            <div className="verify-progress"></div>
          </div>
        )}

        {error && (
          <div className="auth-error-card" style={{ marginBottom: 0 }}>
            <span className="auth-error-icon">!</span>
            <p className="auth-error-text">{error}</p>
          </div>
        )}

        <div className="resend-section">
          <p className="resend-text">Didn't receive the code?</p>
          <button
            onClick={handleResend}
            disabled={resendCountdown > 0 || resendLoading}
            className="resend-button"
          >
            {resendLoading ? 'Sending...' : resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Code'}
          </button>
          {resendMessage && (
            <p className={`resend-message ${resendMessage.includes('sent') ? 'success' : ''}`}>
              {resendMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailScreen;
