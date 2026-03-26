import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { decryptMessage } from '../lib/crypto';

export default function ProfileModal({ partner, isOnline, currentUser, sharedKey, currentMessages, onClose, onNicknameUpdate, onAvatarUpdate, onJumpToMessage, onClearChat }) {
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [nickname, setNickname] = useState('');
  const [nickSaving, setNickSaving] = useState(false);
  const [nickSuccess, setNickSuccess] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingLoading, setIsSearchingLoading] = useState(false);

  const fileRef = useRef();

  useEffect(() => {
    if (!isSearching || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingLoading(true);

      // 1. Local Search (already decrypted in parent)
      const query = searchQuery.toLowerCase();
      const localMatches = (currentMessages || []).filter(m => 
        m.text && m.text.toLowerCase().includes(query) && (!m.iv || m._decrypted)
      );

      try {
        // 2. API Search (might find older messages)
        const res = await api.get(`/messages/search?q=${encodeURIComponent(searchQuery)}`);
        const apiMessages = res.data.messages || [];

        // 3. Decrypt API results
        const decryptedApiResults = await Promise.all(apiMessages.map(async (m) => {
          // If already decrypted in local matches, use that
          const existing = localMatches.find(l => l._id === m._id);
          if (existing) return existing;

          if (m.iv && m.text && !m.isDeleted && sharedKey) {
            try {
              const dec = await decryptMessage(m.text, m.iv, sharedKey);
              return { ...m, text: dec, _decrypted: true };
            } catch (err) {
              // Return with original text but WITHOUT _decrypted flag, 
              // so it won't be matched if it was encrypted.
              return { ...m, _decrypted: false };
            }
          }
          return { ...m, _decrypted: !m.iv }; // cleartext is considered 'decrypted'
        }));

        // 4. Merge and Deduplicate
        const merged = [...localMatches];
        const localIds = new Set(localMatches.map(m => m._id));

        decryptedApiResults.forEach(m => {
          if (!localIds.has(m._id)) {
            // Verify it actually matches decrypted text AND is decrypted/cleartext
            if (m.text && m.text.toLowerCase().includes(query) && m._decrypted) {
              merged.push(m);
            }
          }
        });

        // Final sort
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setSearchResults(merged);
      } catch (err) {
        setSearchResults(localMatches);
      } finally {
        setIsSearchingLoading(false);
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isSearching, currentMessages, sharedKey]);

  useEffect(() => {
    if (!partner?._id) return;
    // Pre-fill nickname if already set
    const existing = currentUser?.nicknames?.[partner._id?.toString()] || currentUser?.nicknames?.[partner._id] || '';
    setNickname(existing);
    setAvatarPreview(partner.avatar || null);

    api.get(`/messages/media/${partner._id}`)
      .then(res => setMedia(res.data.media))
      .catch(() => {})
      .finally(() => setLoadingMedia(false));
  }, [partner, currentUser]);

  const handleAvatarSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Compress
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
      setAvatarPreview(base64);
      setAvatarSaving(true);
      try {
        const res = await api.patch(`/auth/avatar/${partner._id}`, { avatar: base64 });
        onAvatarUpdate(res.data.user);
      } catch (err) {
        alert('Failed to update avatar');
      } finally {
        setAvatarSaving(false);
      }
    };
    img.src = url;
  };

  const handleNicknameSave = async (e) => {
    e.preventDefault();
    setNickSaving(true);
    setNickSuccess('');
    try {
      const res = await api.patch(`/auth/nickname/${partner._id}`, { nickname });
      onNicknameUpdate(res.data.user);
      setNickSuccess('Saved 💕');
      setTimeout(() => setNickSuccess(''), 2000);
    } catch {
      alert('Failed to save nickname');
    } finally {
      setNickSaving(false);
    }
  };

  if (!partner) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-rose-400 to-pink-500 px-6 pt-8 pb-16 text-center shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none" aria-label="Close">×</button>
          <button onClick={() => setIsSearching(v => !v)} className="absolute top-4 left-4 text-white/70 hover:text-white text-xl leading-none focus:outline-none" aria-label="Search Messages" title="Search Messages">🔍</button>

          {/* Avatar with upload button */}
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full bg-white/30 flex items-center justify-center text-4xl shadow-lg overflow-hidden">
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                : <span>🌸</span>
              }
            </div>
            {/* Camera overlay */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarSaving}
              className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-50 transition-colors"
              aria-label="Change avatar"
            >
              {avatarSaving ? '⏳' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
          </div>

          <h2 className="text-white text-xl font-bold">{partner.name}</h2>
          {nickname && <p className="text-white/90 text-sm mt-0.5">"{nickname}"</p>}
          <p className="text-white/70 text-xs mt-1">{isOnline ? '🟢 Online now' : '⚫ Offline'}</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto relative z-10 bg-white dark:bg-gray-900">
          {isSearching ? (
            <div className="flex flex-col h-full bg-white dark:bg-gray-900">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-20">
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:border-rose-400"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {isSearchingLoading && <p className="text-center text-rose-400 text-xs py-4 animate-pulse">Searching...</p>}
                {!isSearchingLoading && searchQuery && searchResults.length === 0 && (
                  <p className="text-center text-gray-400 text-xs py-4">No exact matches found</p>
                )}
                <div className="space-y-3 pb-8 mt-2">
                  {searchResults.map(msg => (
                    <button
                      key={msg._id}
                      onClick={() => {
                        onClose();
                        if (onJumpToMessage) onJumpToMessage(msg._id);
                      }}
                      className="w-full text-left bg-gray-50 dark:bg-gray-800 rounded-xl p-3 hover:bg-rose-50 dark:hover:bg-gray-700 transition flex flex-col gap-1 border border-transparent hover:border-rose-200"
                    >
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span className="font-semibold text-rose-500">{msg.senderId?.name}</span>
                        <span>{new Date(msg.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{msg.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Info + nickname */}
              <div className="mx-4 -mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-md px-5 py-4 z-10 mb-4 relative">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Nickname</p>
            <form onSubmit={handleNicknameSave} className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="Give them a cute nickname 💕"
                className="flex-1 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-sm focus:outline-none focus:border-rose-400 bg-rose-50/50 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={nickSaving}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 text-white text-sm font-medium hover:shadow-md transition-all disabled:opacity-60"
              >
                {nickSaving ? '...' : nickSuccess || 'Save'}
              </button>
            </form>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">Member since {new Date(partner.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            
            <button
              onClick={onClearChat}
              className="mt-6 w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-red-500 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
            >
              <span>🗑️</span> Clear Chat History
            </button>
          </div>

          {/* Media grid */}
          <div className="px-4 pb-6">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Shared Media ({media.length})</p>
            {loadingMedia ? (
              <div className="grid grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => <div key={i} className="aspect-square bg-rose-50 dark:bg-gray-800 rounded-xl animate-pulse" />)}
              </div>
            ) : media.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🖼️</div>
                <p className="text-gray-400 text-sm">No media shared yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {media.map(m => (
                  <button key={m._id} onClick={() => setLightbox(m.image)} className="aspect-square rounded-xl overflow-hidden hover:opacity-90 transition-opacity focus:outline-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.image} alt="media" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-fade-in" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Full size" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl" onClick={() => setLightbox(null)} aria-label="Close">×</button>
        </div>
      )}
    </div>
  );
}
