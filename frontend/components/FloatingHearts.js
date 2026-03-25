import { useEffect, useState } from 'react';

// Subtle floating hearts background animation
export default function FloatingHearts() {
  const [hearts, setHearts] = useState([]);

  useEffect(() => {
    const emojis = ['❤️', '💕', '💗', '💖', '🌸', '💝'];

    const spawn = () => {
      const id = Date.now() + Math.random();
      const heart = {
        id,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        left: Math.random() * 100,
        duration: 4 + Math.random() * 3,
        size: 0.8 + Math.random() * 0.8,
      };
      setHearts(prev => [...prev, heart]);
      // Remove after animation
      setTimeout(() => {
        setHearts(prev => prev.filter(h => h.id !== id));
      }, (heart.duration + 0.5) * 1000);
    };

    // Spawn a heart every 3 seconds
    const interval = setInterval(spawn, 3000);
    spawn(); // spawn one immediately
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {hearts.map(heart => (
        <span
          key={heart.id}
          className="heart-float select-none"
          style={{
            left: `${heart.left}%`,
            fontSize: `${heart.size}rem`,
            animationDuration: `${heart.duration}s`,
          }}
        >
          {heart.emoji}
        </span>
      ))}
    </div>
  );
}
