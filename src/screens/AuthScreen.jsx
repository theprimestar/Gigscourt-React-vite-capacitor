import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import '../Auth.css';

function AuthScreen({ onVerifyEmail }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getErrorMessage = (err) => {
    const msg = err.message || '';
    if (msg.includes('Invalid login credentials') || msg.includes('Invalid API key')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (msg.includes('Email not confirmed')) {
      return 'Please verify your email first. Check your inbox for the code.';
    }
    if (msg.includes('User already registered') || msg.includes('already been registered')) {
      return 'An account with this email already exists. Please log in instead.';
    }
    if (msg.includes('Password should be at least 6 characters')) {
      return 'Password must be at least 6 characters.';
    }
    if (msg.includes('Unable to reach') || msg.includes('network') || msg.includes('fetch')) {
      return 'No internet connection. Check your signal and try again.';
    }
    if (msg.includes('For security purposes, you can only request this') || msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (msg.includes('valid email')) {
      return 'Please enter a valid email address.';
    }
    return 'Something went wrong. Please try again.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          if (!data.user.email_confirmed_at) {
            onVerifyEmail(email.trim());
          }
          // Verified users auto-navigate via onAuthStateChange in App.jsx
        }
      } else {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) throw error;

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    setError('An account with this email already exists. Please log in instead.');
    setLoading(false);
    return;
  }

  if (data.user) {
    onVerifyEmail(email.trim());
  }
}
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-header">
        <div className="auth-logo">
          <div className="auth-circle auth-circle-left"></div>
          <div className="auth-circle auth-circle-right"></div>
        </div>
        <h1>GigsCourt</h1>
        <p>Find local services near you</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="input-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className={error && error.includes('email') ? 'input-error' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Your password"
            required
            minLength={6}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            className={error && error.includes('Password') ? 'input-error' : ''}
          />
        </div>

        {error && (
          <div className="auth-error-card">
            <span className="auth-error-icon">!</span>
            <p className="auth-error-text">{error}</p>
          </div>
        )}

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? (
            <span className="auth-button-loading">
              {isLogin ? 'Signing in' : 'Creating account'}
              <span className="loading-dots"></span>
            </span>
          ) : isLogin ? 'Log In' : 'Sign Up'}
        </button>

        <p className="auth-toggle">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="toggle-button"
          >
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </form>
    </div>
  );
}

export default AuthScreen;
