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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const fileRef = useRef();
  const emojiRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset to calculate
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [text]);

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

  // Timer for voice recording
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleSend = async () => {
    console.log('📤 handleSend called', { hasText: !!text.trim(), hasImage: !!imagePreview, hasAudio: !!audioBlob });
    if (!text.trim() && !imagePreview && !audioBlob) return;
    
    let voiceBase64 = null;
    if (audioBlob) {
      try {
        console.log('🎙️ Converting audio blob to base64...', audioBlob.size);
        voiceBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        console.log('✅ Base64 conversion complete');
      } catch (err) {
        console.error('❌ Failed to convert audio to base64:', err);
      }
    }

    const payload = { 
      text: text.trim(), 
      image: imagePreview, 
      voice: voiceBase64,
      voiceDuration: recordingDuration || 0,
      replyTo: replyTo?._id 
    };

    console.log('🚀 Sending payload to onSend', { voiceLen: voiceBase64?.length });
    onSend(payload);
    
    setText('');
    setImagePreview(null);
    setAudioBlob(null);
    setRecordingDuration(0);
    setShowEmoji(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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

  const startRecording = async () => {
    try {
      console.log('🎙️ Starting recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';
      
      console.log('🔧 Using mimeType:', mimeType);
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setRecordingDuration(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('⏹️ Recording stopped, chunks:', chunksRef.current.length);
        if (chunksRef.current.length === 0) {
          console.warn('⚠️ No audio chunks recorded');
          setIsRecording(false);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('📦 Created blob:', blob.size, blob.type);
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioBlob(null);
      chunksRef.current = [];
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

      {/* Audio preview */}
      {audioBlob && (
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-900/20 px-4 py-2 mb-2 rounded-2xl animate-fade-in border border-rose-100 dark:border-rose-900/30 max-w-fit">
          <div className="flex items-center gap-2 text-rose-500">
            <span className="text-xl font-medium">🎤 Voice Message</span>
            <span className="text-xs font-mono">{formatTime(recordingDuration)}</span>
          </div>
          <button
            onClick={() => { setAudioBlob(null); setRecordingDuration(0); }}
            className="text-gray-400 hover:text-rose-500 text-lg ml-1"
            aria-label="Remove voice"
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

        {/* Voice / Stop button */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-2 py-1 bg-rose-50 dark:bg-rose-900/20 rounded-2xl animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{formatTime(recordingDuration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={cancelRecording} className="text-gray-400 hover:text-rose-500 text-xs font-medium">Cancel</button>
              <button onClick={stopRecording} className="text-rose-500 hover:text-rose-600 font-bold text-sm">DONE</button>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Say something sweet... 💕"
            rows={1}
            disabled={disabled}
            className="chat-input flex-1 bg-transparent resize-none outline-none text-[16px] text-gray-700 dark:text-gray-200 placeholder-rose-300 dark:placeholder-rose-700 max-h-[120px] py-1 scrollbar-hide"
            style={{ lineHeight: '1.5', minHeight: '36px' }}
          />
        )}

        {/* Image upload */}
        {!isRecording && (
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xl p-1 hover:scale-110 transition-transform"
            aria-label="Attach image"
          >
            📷
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Voice Recording / Send Button */}
        {!isRecording && !text.trim() && !imagePreview && !audioBlob ? (
          <button
            onClick={startRecording}
            className="text-xl p-1 hover:scale-110 transition-transform text-gray-500 hover:text-rose-500"
            aria-label="Record voice"
          >
            🎤
          </button>
        ) : (
          !isRecording && (
            <button
              onClick={handleSend}
              disabled={!text.trim() && !imagePreview && !audioBlob}
              className="bg-gradient-to-br from-rose-400 to-pink-500 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100"
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 rotate-45">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            </button>
          )
        )}
      </div>
    </div>
  );
}
