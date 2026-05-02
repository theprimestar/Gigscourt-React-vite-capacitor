import React from 'react';
import './ChatUnread.css';

const IconArrowDown = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

export function UnreadBanner({ count, onDismiss }) {
  if (count <= 0) return null;

  return (
    <div className="unread-banner">
      <span className="unread-banner-text">
        {count} unread message{count !== 1 ? 's' : ''}
      </span>
      <button className="unread-banner-dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}

export function ScrollToBottomButton({ count, onClick, visible }) {
  if (!visible) return null;

  return (
    <button className="scroll-to-bottom-btn" onClick={onClick}>
      <IconArrowDown />
      {count > 0 && (
        <span className="scroll-to-bottom-badge">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
