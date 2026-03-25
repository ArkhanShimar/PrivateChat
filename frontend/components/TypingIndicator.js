// Animated "typing..." indicator shown when partner is typing
export default function TypingIndicator({ name }) {
  return (
    <div className="flex justify-start mb-2 animate-fade-in">
      <div className="bg-white/80 backdrop-blur px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-1">{name} is typing</span>
        <span className="typing-dot w-1.5 h-1.5 bg-rose-400 rounded-full inline-block" />
        <span className="typing-dot w-1.5 h-1.5 bg-rose-400 rounded-full inline-block" />
        <span className="typing-dot w-1.5 h-1.5 bg-rose-400 rounded-full inline-block" />
      </div>
    </div>
  );
}
