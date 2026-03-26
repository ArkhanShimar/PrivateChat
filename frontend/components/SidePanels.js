import { useState, useEffect, useRef } from 'react';
import { romanticQuotes } from '../lib/quotes';

const leftPoems = [
  { emoji: '🌹', text: 'Every moment with you is a memory I treasure forever.' },
  { emoji: '💫', text: 'You are the reason I smile without any reason.' },
  { emoji: '🌙', text: 'Even the stars are jealous of the way your eyes shine.' },
  { emoji: '🦋', text: 'Falling for you was the best accident of my life.' },
];

const loveNotes = [
  "Distance means nothing when someone means everything.",
  "You are my favorite notification.",
  "I fell in love with you because you loved me when I couldn't love myself.",
  "Every love story is beautiful, but ours is my favorite.",
  "You make ordinary moments feel magical.",
  "I want to be your last everything.",
  "My heart is and always will be yours.",
  "You are the poem I never knew how to write.",
  "In you, I found the love I was looking for.",
  "You are my sunshine on a cloudy day. ☀️",
];

const rightStats = [
  { emoji: '💕', label: 'Just the Two of Us' },
];

const floatingEmojis = ['❤️', '💕', '🌸', '💖', '✨', '🌹', '💗', '🫶'];

// Hook: cycles through an array with a fade on just the text
function useFadingIndex(length, interval = 6000) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % length);
        setVisible(true);
      }, 350);
    }, interval);
    return () => clearInterval(timer);
  }, [length, interval]);

  return { index, visible };
}

export function LeftPanel() {
  const { index: quoteIndex, visible: quoteVisible } = useFadingIndex(romanticQuotes.length, 6000);

  return (
    <div className="hidden lg:flex flex-col h-full overflow-hidden py-8 px-5 gap-5 justify-between">

      {/* Quote card — container stays, only text fades */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur rounded-3xl p-5 shadow-md border border-rose-100 dark:border-rose-900/40 text-center flex-shrink-0">
        <div className="text-2xl mb-3 animate-pulse-heart">❤️</div>
        <div className="min-h-[60px] flex items-center justify-center">
          <p
            className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed italic transition-opacity duration-350"
            style={{ opacity: quoteVisible ? 1 : 0 }}
          >
            "{romanticQuotes[quoteIndex]}"
          </p>
        </div>
        {/* Dot indicators */}
        <div className="flex justify-center gap-1 mt-3">
          {romanticQuotes.map((_, i) => (
            <span
              key={i}
              className="inline-block rounded-full transition-all duration-300"
              style={{
                width: i === quoteIndex ? '16px' : '6px',
                height: '6px',
                background: i === quoteIndex ? '#f43f5e' : '#fda4af',
              }}
            />
          ))}
        </div>
      </div>

      {/* Poem cards */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        {leftPoems.map((p, i) => (
          <div key={i} className="bg-white/50 dark:bg-gray-800/50 backdrop-blur rounded-2xl px-4 py-3 border border-rose-100 dark:border-rose-900/40 flex gap-3 items-start">
            <span className="text-lg flex-shrink-0">{p.emoji}</span>
            <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{p.text}</p>
          </div>
        ))}
      </div>

      {/* Floating emojis */}
      <div className="flex gap-2 flex-wrap justify-center flex-shrink-0">
        {floatingEmojis.map((e, i) => (
          <span
            key={i}
            className="text-xl animate-float"
            style={{ animationDelay: `${i * 0.3}s`, animationDuration: `${3 + i * 0.4}s` }}
          >
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RightPanel({ user, onOpenAccount, onAvatarUpdate }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const { index: noteIndex, visible: noteVisible } = useFadingIndex(loveNotes.length, 5000);
  const fileRef = useRef(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  const handleAvatarSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);
      setAvatarSaving(true);
      try {
        const api = (await import('../lib/api')).default;
        const res = await api.patch(`/auth/avatar/${user._id}`, { avatar: base64 });
        onAvatarUpdate(res.data.user);
      } catch { alert('Failed to update avatar'); }
      finally { setAvatarSaving(false); }
    };
    img.src = url;
  };

  return (
    <div className="hidden lg:flex flex-col h-full overflow-hidden py-8 px-5 gap-5 justify-between">

      {/* Date */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur rounded-2xl px-4 py-3 border border-rose-100 dark:border-rose-900/40 text-center flex-shrink-0">
        <p className="text-rose-300 text-xs font-medium">Today</p>
        <p className="text-gray-600 dark:text-gray-300 text-sm font-semibold mt-0.5">{today}</p>
      </div>

      {/* NEW: First Texted Date */}
      <div className="bg-gradient-to-r from-rose-100 to-pink-100 dark:from-rose-900/40 dark:to-pink-900/40 backdrop-blur rounded-2xl px-4 py-3 border border-rose-200 dark:border-rose-800 text-center flex-shrink-0 shadow-sm relative overflow-hidden group">
        <div className="absolute -right-4 -top-4 text-4xl opacity-20 group-hover:scale-110 transition-transform">✨</div>
        <p className="text-rose-500 dark:text-rose-300 text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Our Beginning 💖</p>
        <p className="text-gray-700 dark:text-gray-200 text-sm font-semibold relative z-10">March 21st, 2026</p>
      </div>

      {/* User card */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur rounded-3xl p-5 shadow-md border border-rose-100 dark:border-rose-900/40 flex-shrink-0">
        <div className="flex flex-col items-center gap-2">
          {/* Avatar with upload */}
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-2xl shadow-md overflow-hidden">
              {user?.avatar
                ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                : <span>🌸</span>
              }
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarSaving}
              className="absolute bottom-0 right-0 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow text-[10px] hover:bg-rose-50 transition-colors"
              aria-label="Change avatar"
            >
              {avatarSaving ? '⏳' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
          </div>
          <button onClick={onOpenAccount} className="flex items-center gap-1.5 group" aria-label="Manage account">
            <p className="font-bold text-gray-700 dark:text-gray-200 text-sm group-hover:text-rose-500 transition-colors">{user?.name}</p>
            <span className="text-gray-300 group-hover:text-rose-400 transition-colors text-sm">⚙️</span>
          </button>
          <p className="text-rose-300 text-xs">You 💕</p>
        </div>
      </div>

      {/* Love note card — container stays, only text fades */}
      <div className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 rounded-3xl p-5 shadow-md border border-rose-100 dark:border-rose-900/40 flex-shrink-0 text-center">
        <div className="text-2xl mb-2 animate-pulse-heart">💌</div>
        <div className="min-h-[52px] flex items-center justify-center">
          <p
            className="text-gray-400 dark:text-gray-500 text-xs leading-relaxed italic transition-opacity duration-350"
            style={{ opacity: noteVisible ? 1 : 0 }}
          >
            "{loveNotes[noteIndex]}"
          </p>
        </div>
        {/* Progress dots */}
        <div className="flex justify-center gap-1 mt-3">
          {loveNotes.map((_, i) => (
            <span
              key={i}
              className="inline-block rounded-full transition-all duration-300"
              style={{
                width: i === noteIndex ? '16px' : '6px',
                height: '6px',
                background: i === noteIndex ? '#f43f5e' : '#fda4af',
              }}
            />
          ))}
        </div>
      </div>

      {/* Romantic badges */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        {rightStats.map((s, i) => (
          <div key={i} className="bg-white/50 dark:bg-gray-800/50 backdrop-blur rounded-xl px-4 py-2.5 border border-rose-100 dark:border-rose-900/40 flex items-center gap-3">
            <span className="text-base flex-shrink-0">{s.emoji}</span>
            <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
