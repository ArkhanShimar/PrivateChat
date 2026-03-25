import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Lazy load emoji picker to reduce initial bundle
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

/**
 * Chat input bar with emoji picker, image upload, and reply preview
 */
export default function ChatInput({ onSend, onTyping, replyTo, onCancelReply, disabled }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef();
  const emojiRef = useRef(null);
  const emojiButtonRef = useRef(null);

  useEffect(() => {
    if (!showEmoji) return;
    const handleClickOutside = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target) &&
          emojiButtonRef.current && !emojiButtonRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showEmoji]);

  const handleSend = () => {
    if (!text.trim() && !imagePreview) return;
    onSend({ text: text.trim(), image: imagePreview, replyTo: replyTo?._id });
    setText('');
    setImagePreview(null);
    setShowEmoji(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
    onTyping();
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Compress image before storing as base64 to stay under socket payload limit
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800; // max width/height in px
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      // Quality 0.7 keeps file small enough for socket
      setImagePreview(canvas.toDataURL('image/jpeg', 0.7));
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const onEmojiClick = (emojiData) => {
    setText(prev => prev + emojiData.emoji);
  };

  return (
    <div className="relative">
      {/* Emoji picker */}
      {showEmoji && (
        <div ref={emojiRef} className="absolute bottom-full mb-2 left-0 z-50 animate-slide-up">
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            height={350}
            width={300}
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 bg-rose-50 border-l-4 border-rose-400 px-3 py-2 mb-1 rounded-lg animate-fade-in">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-rose-500 font-semibold">{replyTo.senderId?.name}</p>
            <p className="text-xs text-gray-500 truncate">{replyTo.text || '📷 Image'}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="text-gray-400 hover:text-rose-500 text-lg leading-none"
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="relative inline-block mb-2 ml-2 animate-fade-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-xl border-2 border-rose-200" />
          <button
            onClick={() => setImagePreview(null)}
            className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-3xl px-3 py-2 shadow-md border border-rose-100 dark:border-rose-900/50">
        {/* Emoji button */}
        <button
          ref={emojiButtonRef}
          onClick={() => setShowEmoji(v => !v)}
          className="text-xl p-1 hover:scale-110 transition-transform"
          aria-label="Open emoji picker"
        >
          😊
        </button>

        {/* Text area */}
        <textarea
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Say something sweet... 💕"
          rows={1}
          disabled={disabled}
          className="chat-input flex-1 bg-transparent resize-none outline-none text-sm text-gray-700 dark:text-gray-200 placeholder-rose-300 dark:placeholder-rose-700 max-h-32 py-1"
          style={{ lineHeight: '1.5' }}
        />

        {/* Image upload */}
        <button
          onClick={() => fileRef.current?.click()}
          className="text-xl p-1 hover:scale-110 transition-transform"
          aria-label="Attach image"
        >
          📷
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() && !imagePreview}
          className="bg-gradient-to-br from-rose-400 to-pink-500 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100"
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-45">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
