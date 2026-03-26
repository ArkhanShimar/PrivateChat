import { useState, useRef, useEffect } from 'react';

export default function VoiceMessage({ url, duration, isOwn }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100);
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-2xl min-w-[200px] ${isOwn ? 'bg-white/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
      <audio ref={audioRef} src={url} preload="metadata" />
      
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
          isOwn 
            ? 'bg-white text-rose-500 hover:scale-110' 
            : 'bg-rose-500 text-white hover:bg-rose-600'
        } shadow-sm`}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex-1 space-y-1">
        <div className="relative h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-100 ${isOwn ? 'bg-white' : 'bg-rose-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[10px] ${isOwn ? 'text-white/80' : 'text-gray-500 font-medium'}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration || audioRef.current?.duration || 0)}</span>
        </div>
      </div>

      <div className={`flex items-center gap-0.5 ${isOwn ? 'text-white/60' : 'text-rose-300'}`}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-300 ${isOwn ? 'bg-white' : 'bg-rose-400'}`}
            style={{
              height: isPlaying ? `${Math.random() * 12 + 4}px` : '4px',
              animation: isPlaying ? `wave 1s ease-in-out ${i * 0.2}s infinite` : 'none'
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes wave {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
    </div>
  );
}
