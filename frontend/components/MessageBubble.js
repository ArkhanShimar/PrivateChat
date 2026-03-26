import { useState, useEffect, useRef } from 'react';
import VoiceMessage from './VoiceMessage';
import { useAuth } from '../context/AuthContext';

const formatTime = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function Lightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Full size" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
      <button className="absolute top-4 right-4 text-white text-4xl leading-none hover:text-rose-300 transition-colors" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

/** Bottom sheet action menu — shown on long press (mobile) */
const REACTION_EMOJIS = ['❤️', '😂', '🥺', '👍', '😮'];

function ActionSheet({ isOwn, isDeleted, onReply, onPin, onDelete, onReact, onClose }) {
  const actions = [
    ...(!isDeleted ? [{ icon: '↩️', label: 'Reply', fn: onReply }] : []),
    ...(!isDeleted ? [{ icon: '📌', label: 'Pin / Unpin', fn: onPin }] : []),
    { icon: '🙈', label: 'Delete for me', fn: () => onDelete(false) },
    ...(isOwn && !isDeleted ? [{ icon: '🗑️', label: 'Delete for everyone', fn: () => onDelete(true), danger: true }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl pb-8 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        
        {!isDeleted && (
          <div className="flex justify-center gap-4 px-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            {REACTION_EMOJIS.map(e => (
              <button key={e} onClick={() => { onReact(e); onClose(); }} className="text-3xl hover:scale-125 transition-transform" aria-label={`React with ${e}`}>{e}</button>
            ))}
          </div>
        )}

        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => { a.fn(); onClose(); }}
            className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors ${
              a.danger
                ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                : 'text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-gray-800'
            } ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
          >
            <span className="text-xl">{a.icon}</span>
            <span className="font-medium text-sm">{a.label}</span>
          </button>
        ))}
        <button
          onClick={onClose}
          className="w-full mt-2 mx-auto block text-center text-rose-400 font-semibold py-3 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, isOwn, onReply, onPin, onDelete, onReact }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [showMenu, setShowMenu] = useState(false);   // desktop hover menu
  const [showReactionMenu, setShowReactionMenu] = useState(false); // desktop reaction menu
  const [showSheet, setShowSheet] = useState(false); // mobile long-press sheet
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const menuRef = useRef(null);
  const reactionMenuRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const swipeTriggered = useRef(false);
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);

  const SWIPE_THRESHOLD = 60;
  const LONG_PRESS_MS = 500;

  // ── Long press ──────────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeTriggered.current = false;
    isLongPress.current = false;
    setSwiping(true);

    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShowSheet(true);
      // Cancel swipe so it doesn't also trigger
      setSwipeX(0);
      setSwiping(false);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Any movement cancels long press
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      clearTimeout(longPressTimer.current);
    }

    if (Math.abs(dy) > Math.abs(dx)) { setSwiping(false); return; }

    const direction = isOwn ? -1 : 1;
    const delta = dx * direction;
    if (delta > 0) {
      const clamped = Math.min(delta, SWIPE_THRESHOLD + 10);
      setSwipeX(clamped * direction);
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
    if (isLongPress.current) { touchStartX.current = null; return; }

    const absSwipe = Math.abs(swipeX);
    if (absSwipe >= SWIPE_THRESHOLD && !swipeTriggered.current && !message.isDeleted) {
      swipeTriggered.current = true;
      onReply(message);
    }
    setSwipeX(0);
    setSwiping(false);
    touchStartX.current = null;
  };

  // ── Desktop hover menu outside-click close ───────────────
  useEffect(() => {
    if (!showMenu && !showReactionMenu) return;
    const handler = (e) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
      if (showReactionMenu && reactionMenuRef.current && !reactionMenuRef.current.contains(e.target)) setShowReactionMenu(false);
    };
    
    // Slight delay to prevent immediate trigger on button click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 10);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showMenu, showReactionMenu]);

  const scrollToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-rose-400', 'ring-offset-1', 'rounded-2xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-rose-400', 'ring-offset-1', 'rounded-2xl'), 1500);
  };

  const renderReactions = () => {
    if (!message.reactions || Object.keys(message.reactions).length === 0) return null;
    const reactingUsers = Object.entries(message.reactions);
    return (
      <div className={`absolute -bottom-3 ${isOwn ? 'right-2' : 'left-2'} bg-white dark:bg-gray-800 rounded-full px-1.5 py-0.5 shadow-md border border-rose-100 dark:border-gray-700 flex items-center gap-1 z-10 text-sm`}>
        {reactingUsers.map(([uid, emoji]) => (
          <span key={uid}>{emoji}</span>
        ))}
      </div>
    );
  };

  return (
    <>
      <div
        id={`msg-${message._id}`}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 message-bubble transition-all duration-300`}
      >
        <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>

          {/* Reply preview */}
          {message.replyTo && (
            <button
              onClick={() => scrollToMessage(message.replyTo._id)}
              className={`text-xs px-3 py-1.5 rounded-t-xl mb-0.5 border-l-2 border-rose-400 bg-white/70 dark:bg-gray-700/80 backdrop-blur text-left hover:bg-rose-50 dark:hover:bg-gray-700 transition-colors ${isOwn ? 'self-end' : 'self-start'}`}
            >
              <span className="text-rose-500 dark:text-rose-300 font-semibold block">{message.replyTo.senderId?.name || 'Message'}</span>
              <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px] block">{message.replyTo.text || '📷 Image'}</span>
            </button>
          )}

          {/* Swipe + long-press container */}
          <div
            className={`relative group flex items-center gap-2 min-w-0 ${showMenu || showReactionMenu ? 'z-50' : 'z-10'}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: `translateX(${swipeX}px)`,
              transition: swiping ? 'none' : 'transform 0.25s ease',
            }}
          >
            {/* Swipe reply hint */}
            {Math.abs(swipeX) > 10 && !message.isDeleted && (
              <div
                className={`absolute ${isOwn ? 'right-full mr-2' : 'left-full ml-2'} flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40`}
                style={{ opacity: Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1) }}
              >
                <span className="text-sm">↩️</span>
              </div>
            )}

            {/* Desktop actions — own messages (left side) */}
            {isOwn && (
              <div className="hidden [@media(hover:hover)]:flex flex-row gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity order-first mr-2 relative">
                {!message.isDeleted && (
                   <button onClick={() => setShowReactionMenu(v => !v)} className="text-base hover:scale-110 transition-transform" title="React">❤️</button>
                )}
                {!message.isDeleted && <button onClick={() => onReply(message)} className="text-base hover:scale-110 transition-transform" title="Reply">↩️</button>}
                {!message.isDeleted && <button onClick={() => onPin(message)} className="text-base hover:scale-110 transition-transform" title="Pin">📌</button>}
                <button onClick={() => setShowMenu(v => !v)} className="text-base hover:scale-110 transition-transform" title="Delete">🗑️</button>
                
                {showReactionMenu && (
                  <div ref={reactionMenuRef} className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-rose-100 dark:border-rose-900/50 flex items-center gap-2 px-3 py-2 z-50 animate-fade-in flex-nowrap">
                    {REACTION_EMOJIS.map(e => (
                      <button key={e} onClick={(ev) => { ev.stopPropagation(); onReact(message._id, e); setShowReactionMenu(false); }} className="hover:scale-125 transition-transform text-2xl">{e}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bubble */}
            <div
              className={`px-4 py-2.5 rounded-2xl shadow-sm min-w-0 max-w-full ${
                isOwn
                  ? 'bg-gradient-to-br from-rose-400 to-pink-500 text-white rounded-br-sm'
                  : 'bg-white/80 dark:bg-gray-800/90 backdrop-blur text-gray-800 dark:text-gray-100 rounded-bl-sm'
              } ${message.pinned ? 'ring-2 ring-rose-300' : ''}`}
            >

               {message.isDeleted ? (
                  <p className={`text-sm italic flex items-center gap-1 ${isOwn ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    🚫 This message was deleted
                  </p>
               ) : (
                 <>
                   {message.image && (
                     <>
                       <button onClick={() => setLightbox(true)} className="mb-2 rounded-xl overflow-hidden max-w-[240px] block hover:opacity-90 transition-opacity focus:outline-none" aria-label="View full image">
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src={message.image} alt="Shared image" className={`w-full rounded-xl transition-opacity ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setImgLoaded(true)} />
                         {!imgLoaded && <div className="w-full h-32 bg-rose-100 animate-pulse rounded-xl" />}
                       </button>
                       {lightbox && <Lightbox src={message.image} onClose={() => setLightbox(false)} />}
                     </>
                   )}

                   {message.voice && (
                     <div className="mb-2">
                       <VoiceMessage url={message.voice} duration={message.voiceDuration} isOwn={isOwn} />
                     </div>
                   )}

                   {message.text && (
                     <p className="text-sm leading-relaxed whitespace-pre-wrap break-words break-all">{message.text}</p>
                   )}
                 </>
               )}

              <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {message.pinned && <span className="text-[10px]">📌</span>}
                <span className={`text-[10px] ${isOwn ? 'text-rose-100' : 'text-gray-400'}`}>{formatTime(message.createdAt)}</span>
                {isOwn && <span className="text-[10px] text-rose-100">{message.seen ? '✓✓' : '✓'}</span>}
              </div>

              {renderReactions()}

              {/* Desktop delete dropdown */}
              {showMenu && (
                <div ref={menuRef} className={`absolute bottom-full mb-1 z-[100] bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-rose-100 dark:border-rose-900/50 overflow-hidden animate-fade-in ${isOwn ? 'right-0' : 'left-0'}`}>
                  <button onClick={() => { onDelete(message._id, false); setShowMenu(false); }} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full text-left whitespace-nowrap">
                    🙈 Delete for me
                  </button>
                  {isOwn && !message.isDeleted && (
                    <button onClick={() => { onDelete(message._id, true); setShowMenu(false); }} className="flex items-center gap-2 px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full text-left whitespace-nowrap border-t border-rose-50 dark:border-rose-900/30">
                      🗑️ Delete for everyone
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Desktop actions — partner messages (right side) */}
            {!isOwn && (
              <div className="hidden [@media(hover:hover)]:flex flex-row gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2 relative">
                {!message.isDeleted && (
                   <button onClick={() => setShowReactionMenu(v => !v)} className="text-base hover:scale-110 transition-transform" title="React">❤️</button>
                )}
                {!message.isDeleted && <button onClick={() => onReply(message)} className="text-base hover:scale-110 transition-transform" title="Reply">↩️</button>}
                {!message.isDeleted && <button onClick={() => onPin(message)} className="text-base hover:scale-110 transition-transform" title="Pin">📌</button>}
                <button onClick={() => setShowMenu(v => !v)} className="text-base hover:scale-110 transition-transform" title="Delete">🗑️</button>
                
                {showReactionMenu && (
                  <div ref={reactionMenuRef} className="absolute bottom-full mb-2 right-0 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-rose-100 dark:border-rose-900/50 flex items-center gap-2 px-3 py-2 z-50 animate-fade-in flex-nowrap">
                    {REACTION_EMOJIS.map(e => (
                      <button key={e} onClick={(ev) => { ev.stopPropagation(); onReact(message._id, e); setShowReactionMenu(false); }} className="hover:scale-125 transition-transform text-2xl">{e}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile long-press action sheet */}
      {showSheet && (
        <ActionSheet
          isOwn={isOwn}
          isDeleted={message.isDeleted}
          onReply={() => onReply(message)}
          onPin={() => onPin(message)}
          onDelete={(forEveryone) => onDelete(message._id, forEveryone)}
          onReact={(emoji) => onReact(message._id, emoji)}
          onClose={() => setShowSheet(false)}
        />
      )}
    </>
  );
}
