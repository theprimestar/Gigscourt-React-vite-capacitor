import React from 'react';
import './Logo.css';

const IconLogo = ({ className }) => (
  <svg 
    viewBox="0 0 48 48" 
    className={`logo-mark ${className || ''}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Vertical oval */}
    <rect 
      x="16" 
      y="4" 
      width="16" 
      height="40" 
      rx="8" 
      fill="currentColor"
    />
    {/* Horizontal oval */}
    <rect 
      x="4" 
      y="16" 
      width="40" 
      height="16" 
      rx="8" 
      fill="currentColor"
    />
  </svg>
);

function Logo() {
  return (
    <div className="logo">
      <IconLogo />
      <span className="logo-text">GigsCourt</span>
    </div>
  );
}

export default Logo;
