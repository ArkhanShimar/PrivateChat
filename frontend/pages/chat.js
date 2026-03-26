import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import api from '../lib/api';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import TypingIndicator from '../components/TypingIndicator';
import FloatingHearts from '../components/FloatingHearts';
import DailyQuote from '../components/DailyQuote';
import ProfileModal from '../components/ProfileModal';
import AccountModal from '../components/AccountModal';
import { LeftPanel, RightPanel } from '../components/SidePanels';
import { useTheme } from '../context/ThemeContext';
import AudioCall from '../components/AudioCall';
import { deriveSharedSecret, encryptMessage, decryptMessage } from '../lib/crypto';

// Notification sound (subtle chime using Web Audio API)
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio not available — silently ignore
  }
};

export default function Chat() {
  const { user, token, loading, logout, privateKey } = useAuth();
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();

  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [partnerName, setPartnerName] = useState('');
  const [partner, setPartner] = useState(null);
  const [partnerLastSeen, setPartnerLastSeen] = useState(null);
  const [myData, setMyData] = useState(null); // full user with avatar/nicknames
  const [showProfile, setShowProfile] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [callState, setCallState] = useState(null); // null, {type: 'outgoing'}, {type: 'incoming', offer, from}
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [sharedKey, setSharedKey] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const messageContainerRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setShowWelcome(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const socketRef = useRef(null);
  const typingTimeout = useRef(null);
  const bottomRef = useRef(null);
  const lastMsgIdRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Load message history
  useEffect(() => {
    if (!user) return;
    api.get('/messages').then(res => {
      setMessages(res.data.messages);
      setHasMore(res.data.hasMore);
      setLoadingMsgs(false);
    }).catch(() => setLoadingMsgs(false));

    // Load pinned message
    api.get('/messages/pinned').then(res => setPinnedMessage(res.data.message)).catch(() => {});

    // Get partner info + full user data (avatar, nicknames)
    api.get('/auth/full-users').then(res => {
      const me = res.data.users.find(u => u._id === user._id || u.name === user.name);
      const p = res.data.users.find(u => u.name !== user.name);
      if (me) setMyData(me);
      if (p) {
        setPartner(p);
        setPartnerLastSeen(p.lastSeen || p.updatedAt || p.createdAt);
        // Show nickname if set, else real name
        const nick = me?.nicknames?.[p._id];
        setPartnerName(nick || p.name);
      }
    });
  }, [user]);

  // Derive Shared Secret once partner and privateKey are available
  useEffect(() => {
    if (privateKey && partner?.publicKey) {
      console.log('Deriving shared key for partner:', partner.name);
      deriveSharedSecret(privateKey, partner.publicKey)
        .then(key => {
          console.log('Shared key derived successfully');
          setSharedKey(key);
        })
        .catch(err => {
          console.error('Shared secret fallback failed:', err);
          setSharedKey(null);
        });
    } else {
      setSharedKey(null);
    }
  }, [privateKey, partner?.publicKey, partner?._id]); // more stable dependencies

  // Re-decrypt messages when sharedKey is ready
  useEffect(() => {
    if (!sharedKey || messages.length === 0) return;
    
    const decryptAll = async () => {
      const decrypted = await Promise.all(messages.map(async (msg) => {
        let updated = false;
        let newMsg = { ...msg };

        // 1. Decrypt main text
        if (msg.iv && msg.text && !msg.isDeleted && !msg._decrypted) {
          const decryptedText = await decryptMessage(msg.text, msg.iv, sharedKey);
          newMsg.text = decryptedText;
          newMsg._decrypted = true;
          updated = true;
        }

        // 2. Decrypt reply preview
        if (msg.replyTo && msg.replyTo.iv && msg.replyTo.text && !msg.replyTo._decrypted) {
          const decReply = await decryptMessage(msg.replyTo.text, msg.replyTo.iv, sharedKey);
          newMsg.replyTo = { ...msg.replyTo, text: decReply, _decrypted: true };
          updated = true;
        }

        return updated ? newMsg : msg;
      }));
      
      const changed = decrypted.some((m, i) => m !== messages[i]);
      if (changed) setMessages(decrypted);

      if (pinnedMessage && pinnedMessage.iv && pinnedMessage.text && !pinnedMessage._decrypted) {
        const decPinned = await decryptMessage(pinnedMessage.text, pinnedMessage.iv, sharedKey);
        setPinnedMessage({ ...pinnedMessage, text: decPinned, _decrypted: true });
      }
    };
    decryptAll();
  }, [sharedKey, messages]); // Watch the whole messages array for changes

  const formatLastSeen = (dateInput) => {
    if (!dateInput) return '';
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return '';
      
      const diffMins = Math.floor((new Date() - date) / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const formatMessageDate = (date) => {
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Socket.IO setup
  useEffect(() => {
    if (!user || !token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('new_message', async (msg) => {
      let finalMsg = { ...msg };
      if (sharedKey) {
        // Decrypt main text
        if (msg.iv && msg.text) {
          const dec = await decryptMessage(msg.text, msg.iv, sharedKey);
          finalMsg.text = dec;
          finalMsg.isDecrypted = true;
        }
        // Decrypt reply preview
        if (msg.replyTo && msg.replyTo.iv && msg.replyTo.text) {
          const decReply = await decryptMessage(msg.replyTo.text, msg.replyTo.iv, sharedKey);
          finalMsg.replyTo = { ...msg.replyTo, text: decReply, _decrypted: true };
        }
      }
      
      setMessages(prev => [...prev, finalMsg]);
      const senderId = finalMsg.senderId?._id
        ? finalMsg.senderId._id.toString()
        : finalMsg.senderId?.toString?.() ?? finalMsg.senderId;
      const isIncoming = senderId !== user._id?.toString();
      if (isIncoming) {
        playNotificationSound();
        // Only mark as seen when the message is from the other person
        socket.emit('mark_seen');
      }
    });

    socket.on('user_typing', ({ name }) => {
      if (name !== user.name) setTypingUser(name);
    });

    socket.on('user_stop_typing', () => setTypingUser(null));

    socket.on('user_online', ({ onlineUsers: online }) => setOnlineUsers(online));
    socket.on('user_offline', ({ userId: offId, onlineUsers: online, lastSeen }) => {
      setOnlineUsers(online);
      if (offId !== user?._id?.toString()) {
        setPartnerLastSeen(lastSeen);
      }
    });

    socket.on('incoming_call', ({ offer, from }) => {
      setCallState({ type: 'incoming', offer, from });
    });

    socket.on('user_typing', ({ userId: typingId }) => {
      if (typingId !== user?._id?.toString()) {
        setIsPartnerTyping(true);
      }
    });

    socket.on('user_stop_typing', ({ userId: typingId }) => {
      if (typingId !== user?._id?.toString()) {
        setIsPartnerTyping(false);
      }
    });

    socket.on('messages_seen', () => {
      setMessages(prev => prev.map(m => {
        const senderId = m.senderId?._id
          ? m.senderId._id.toString()
          : m.senderId?.toString?.() ?? m.senderId;
        return senderId === user._id?.toString()
          ? { ...m, seen: true }
          : m;
      }));
    });

    socket.on('upload_error', ({ message: msg }) => {
      alert('📷 ' + msg);
    });

    socket.on('message_pinned', (msg) => {
      setPinnedMessage(msg);
      setMessages(prev => prev.map(m =>
        m._id === msg._id ? { ...m, pinned: true } : { ...m, pinned: false }
      ));
    });

    socket.on('message_unpinned', () => {
      setPinnedMessage(null);
      setMessages(prev => prev.map(m => ({ ...m, pinned: false })));
    });

    socket.on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isDeleted: true, text: '', image: null, replyTo: null } : m));
    });

    socket.on('message_reaction', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    });

    socket.on('chat_cleared', () => {
      setMessages([]);
      setPinnedMessage(null);
    });

    // Mark existing unread incoming messages as seen on connect
    // Only if partner is already online (they can receive the seen event)
    // We rely on new_message events to trigger mark_seen going forward

    return () => {
      socket.off('new_message');
      socket.off('user_typing');
      socket.off('user_stop_typing');
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('messages_seen');
      socket.off('upload_error');
      socket.off('message_pinned');
      socket.off('message_unpinned');
      socket.off('message_deleted');
      socket.off('chat_cleared');
      socket.off('incoming_call');
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, [user, token]);

  // Auto-scroll to bottom only on NEW messages (at the end)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg?._id;

    // Trigger scroll ONLY if:
    // 1. The very last message in the array is new/different
    // 2. Someone starts typing
    if ((lastId && lastId !== lastMsgIdRef.current) || typingUser) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (lastId) lastMsgIdRef.current = lastId;
    }
  }, [messages, typingUser]);

  const handleSend = useCallback(async ({ text, image, replyTo: replyId }) => {
    if (!socketRef.current) return;
    
    let payload = { text, image, replyTo: replyId };
    
    if (text) {
      if (sharedKey) {
        const { ciphertext, iv } = await encryptMessage(text, sharedKey);
        payload.text = ciphertext;
        payload.iv = iv;
      } else {
        // Privacy Guard: Block plaintext if encryption is intended but key is missing
        console.error('Encryption key not established. Blocking message for privacy.');
        alert('⚠️ Secure connection not established. Please try refreshing or logging out.');
        return;
      }
    }

    socketRef.current.emit('send_message', payload);
    socketRef.current.emit('stop_typing');
    setReplyTo(null);
  }, [sharedKey]);

  const handleDelete = useCallback((messageId, forEveryone) => {
    if (forEveryone) {
      // Delete from DB and notify both users via socket
      socketRef.current?.emit('delete_message', { messageId });
    } else {
      // Delete for me only — just remove from local state
      setMessages(prev => prev.filter(m => m._id !== messageId));
    }
  }, []);

  const handleClearChat = useCallback(() => {
    socketRef.current?.emit('clear_chat');
    setShowClearConfirm(false);
  }, []);

  const handleTyping = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('typing');
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing');
    }, 2000);
  }, []);

  const handlePin = useCallback((message) => {
    if (!socketRef.current) return;
    if (message.pinned) {
      socketRef.current.emit('unpin_message');
    } else {
      socketRef.current.emit('pin_message', { messageId: message._id });
    }
  }, []);

  const handleReact = useCallback((messageId, emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit('react_message', { messageId, emoji });
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (isFetchingMore || !hasMore || !user) return;
    
    // Record current scroll height before adding messages
    const container = messageContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;
    
    setIsFetchingMore(true);
    try {
      const nextPage = page + 1;
      const res = await api.get(`/messages?page=${nextPage}`);
      const newMsgs = res.data.messages || [];
      
      if (newMsgs.length > 0) {
        // Decrypt historic messages before adding to state
        const decryptedHistoric = await Promise.all(newMsgs.map(async (msg) => {
          if (sharedKey && msg.iv && msg.text && !msg.isDeleted) {
            const dec = await decryptMessage(msg.text, msg.iv, sharedKey);
            return { ...msg, text: dec, _decrypted: true };
          }
          return msg;
        }));

        setMessages(prev => [...decryptedHistoric, ...prev]);
        setPage(nextPage);
      }
      setHasMore(res.data.hasMore);

      // Restore scroll position after React renders
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - oldScrollHeight;
        });
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [page, hasMore, isFetchingMore, user]);

  const handleScroll = (e) => {
    // If scrolled to top, load more
    if (e.target.scrollTop === 0 && hasMore && !isFetchingMore) {
      loadMoreMessages();
    }
  };

  const scrollToPinned = () => {
    if (!pinnedMessage) return;
    scrollToMessageId(pinnedMessage._id);
  };

  const scrollToMessageId = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-rose-400', 'ring-offset-1', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-rose-400', 'ring-offset-1', 'rounded-2xl'), 1500);
    } else {
      alert("Message is further back in history. Please scroll up first.");
    }
  };

  const isPartnerOnline = onlineUsers.some(id => {
    // Check if any online user is not the current user
    return id !== user?._id?.toString();
  });

  if (loading || !user) return null;

  return (
    <div className="fixed inset-0 w-full overflow-hidden flex flex-col">
      <FloatingHearts />

      {/* Desktop 3-column layout — all columns locked to viewport height */}
      <div className="flex-1 min-h-0 max-w-6xl w-full mx-auto lg:grid lg:grid-cols-[260px_minmax(0,1fr)_260px] overflow-hidden">

        {/* Left decorative panel */}
        <LeftPanel />

        {/* Center chat column — flex column, fills height, messages scroll internally */}
        <div className="flex flex-col h-full min-h-0 min-w-0 lg:border-x border-rose-100 dark:border-rose-900/50 bg-white/30 dark:bg-black/20 backdrop-blur-sm">

          {/* Header — fixed at top */}
          <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/90 backdrop-blur border-b border-rose-100 dark:border-rose-900/50 shadow-sm z-20">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => partner && setShowProfile(true)}
                className="relative focus:outline-none flex-shrink-0"
                aria-label="View partner profile"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-md hover:scale-105 transition-transform overflow-hidden">
                  {partner?.avatar
                    ? <img src={partner.avatar} alt="avatar" className="w-full h-full object-cover" />
                    : '🌸'
                  }
                </div>
                {isPartnerOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                )}
              </button>

              <button
                onClick={() => partner && setShowProfile(true)}
                className="flex-1 text-left focus:outline-none min-w-0"
                aria-label="View partner profile"
              >
                <h1 className="font-bold text-gray-800 dark:text-rose-100 text-sm truncate">
                  {partnerName ? `${partnerName} 💕` : 'System Access'}
                </h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {isPartnerTyping ? (
                    <span className="text-rose-500 font-medium animate-pulse">Typing...</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{isPartnerOnline ? '🟢 Online' : (partnerLastSeen ? `⚫ Last seen ${formatLastSeen(partnerLastSeen)}` : '⚫ Offline')}</span>
                      {sharedKey ? (
                        <span title="End-to-End Encrypted" className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ml-1">
                          🔒 E2EE
                        </span>
                      ) : (
                        <span title="Not Encrypted" className="text-[10px] bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ml-1">
                          🔓 Unsecured
                        </span>
                      )}
                    </div>
                  )}
                </p>
              </button>

              {/* Call button */}
              {isPartnerOnline && (
                <button
                  onClick={() => setCallState({ type: 'outgoing' })}
                  className="p-1.5 mr-1 rounded-xl bg-green-500/10 text-green-500 hover:bg-green-500/20 dark:bg-green-500/20 dark:hover:bg-green-500/30 transition-colors flex-shrink-0"
                  aria-label="Call partner"
                  title="Audio Call"
                >
                  📞
                </button>
              )}

              {/* Mobile-only account */}
              <button
                onClick={() => setShowAccount(true)}
                className="lg:hidden text-xl p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors flex-shrink-0"
                aria-label="Manage account"
              >
                ⚙️
              </button>
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors flex-shrink-0"
                aria-label="Toggle theme"
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? '☀️' : '🌙'}
              </button>
              {/* Logout icon — always visible */}
              <button
                onClick={logout}
                className="p-1.5 rounded-xl hover:bg-rose-50 transition-colors flex-shrink-0"
                aria-label="Logout"
                title="Logout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-rose-300 hover:text-rose-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages — this is the ONLY scrollable area */}
          <div
            ref={messageContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden w-full px-4 pb-2 min-h-0"
          >
            {isFetchingMore && (
              <div className="flex justify-center py-2 text-[10px] text-rose-300 animate-pulse">
                Getting older memories... 💕
              </div>
            )}
            {showWelcome && (
              <div className="text-center py-6 animate-fade-in flex flex-col items-center justify-center">
                <div className="text-4xl mb-2 animate-bounce">🏠</div>
                <p className="text-rose-400 dark:text-rose-300 font-bold text-lg">Welcome home, my love ❤️</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs">Everything here is private and secure 🔒</p>
              </div>
            )}
            <DailyQuote />
            
            {/* Pinned message banner */}
            {pinnedMessage && (
              <button
                onClick={scrollToPinned}
                className="w-full sticky top-0 z-20 flex items-center gap-2 px-4 py-2 mt-2 bg-rose-50/90 dark:bg-rose-900/40 backdrop-blur-sm border border-rose-100 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors text-left rounded-xl shadow-sm"
              >
                <span className="text-sm flex-shrink-0">📌</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-rose-400 font-semibold uppercase tracking-wide">Pinned message</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 truncate italic">{pinnedMessage.text || '📷 Image'}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); socketRef.current?.emit('unpin_message'); }}
                  className="text-gray-300 hover:text-rose-400 text-lg leading-none flex-shrink-0"
                  aria-label="Unpin"
                >×</button>
              </button>
            )}
            {loadingMsgs ? (
              <div className="flex justify-center py-8">
                <div className="text-rose-300 animate-pulse">Loading messages... 💕</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4 animate-pulse-heart">💌</div>
                <p className="text-rose-400 font-medium">No messages yet</p>
                <p className="text-gray-400 text-sm mt-1">Send the first message 💕</p>
              </div>
              ) : (
                messages.map((msg, idx) => {
                  const senderId = msg.senderId?._id
                    ? msg.senderId._id.toString()
                    : msg.senderId?.toString?.() ?? msg.senderId;
                  const isOwn = senderId === user._id?.toString();
                  
                  // Show date separator if this message is on a new day
                  const msgDate = new Date(msg.createdAt).toDateString();
                  const prevMsgDate = idx > 0 ? new Date(messages[idx - 1].createdAt).toDateString() : null;
                  const showDate = msgDate !== prevMsgDate;

                  return (
                    <div key={msg._id}>
                      {showDate && (
                        <div className="sticky top-0 z-10 flex justify-center my-6 pointer-events-none">
                          <span className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm border border-rose-100 dark:border-rose-900/30 text-rose-400 dark:text-rose-300 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                            {formatMessageDate(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={msg}
                        isOwn={isOwn}
                        onReply={setReplyTo}
                        onPin={handlePin}
                        onDelete={handleDelete}
                        onReact={handleReact}
                      />
                    </div>
                  );
                })
              )}
            {typingUser && <TypingIndicator name={typingUser} />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar — pinned to bottom, never moves */}
          <div className="flex-shrink-0 bg-white/60 dark:bg-gray-900/80 backdrop-blur border-t border-rose-100 dark:border-rose-900/50 px-4 py-3 z-20">
            <ChatInput
              onSend={handleSend}
              onTyping={handleTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </div>
        </div>

        {/* Right info panel */}
        <RightPanel
          user={myData || user}
          onOpenAccount={() => setShowAccount(true)}
          onAvatarUpdate={(updated) => setMyData(updated)}
        />
      </div>

      {/* Modals */}
      {showProfile && (
        <ProfileModal
          partner={partner}
          isOnline={isPartnerOnline}
          currentUser={myData || user}
          sharedKey={sharedKey}
          currentMessages={messages}
          onClose={() => setShowProfile(false)}
          onNicknameUpdate={(updatedMe) => {
            setMyData(updatedMe);
            // Update displayed name in header
            const nick = updatedMe?.nicknames?.[partner._id];
            setPartnerName(nick || partner.name);
          }}
          onAvatarUpdate={(updatedPartner) => {
            setPartner(updatedPartner);
          }}
          onJumpToMessage={scrollToMessageId}
          onClearChat={() => { setShowProfile(false); setShowClearConfirm(true); }}
        />
      )}
      {showAccount && (
        <AccountModal
          user={user}
          onClose={() => setShowAccount(false)}
          onUpdate={() => { window.location.reload(); }}
          onDeleted={() => { logout(); router.replace('/login'); }}
        />
      )}

      {/* Audio Calling Overlay */}
      {callState && (
        <AudioCall
          socket={socketRef.current}
          callState={callState}
          partner={partner}
          partnerName={partnerName}
          onEnd={() => setCallState(null)}
        />
      )}

      {/* Clear chat confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in px-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center animate-slide-up">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">Clear Chat?</h3>
            <p className="text-gray-400 text-sm mb-6">This will delete all messages for both of you. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl border border-rose-200 text-rose-400 text-sm font-medium hover:bg-rose-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearChat}
                className="flex-1 py-2.5 rounded-2xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
