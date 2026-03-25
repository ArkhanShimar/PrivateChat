import { useState, useRef } from 'react';
import api from '../lib/api';

const tabs = ['Name', 'Photo', 'Password', 'PIN', 'Delete'];

/**
 * Account management modal — change name, password, PIN, or delete account
 */
export default function AccountModal({ user, onClose, onUpdate, onDeleted }) {
  const [tab, setTab] = useState('Name');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const fileRef = useRef();

  // Form states
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const reset = () => {
    setError('');
    setSuccess('');
  };

  const handleTabChange = (t) => {
    setTab(t);
    reset();
  };

  const handleAvatarSelect = (e) => {
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
      setAvatarPreview(base64);
      setLoading(true); reset();
      try {
        const res = await api.patch(`/auth/avatar/${user._id}`, { avatar: base64 });
        onUpdate(res.data.user);
        setSuccess('Profile photo updated 💕');
      } catch {
        setError('Failed to update photo');
      } finally {
        setLoading(false);
      }
    };
    img.src = url;
  };

  const handleNameUpdate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name cannot be empty');
    setLoading(true); reset();
    try {
      const res = await api.patch('/auth/update', { name: name.trim() });
      onUpdate(res.data.user);
      setSuccess('Name updated 💕');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
    if (newPassword.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true); reset();
    try {
      await api.patch('/auth/update', { currentPassword, newPassword });
      setSuccess('Password updated 💕');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handlePinUpdate = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPin)) return setError('PIN must be exactly 6 digits');
    if (newPin !== confirmPin) return setError('PINs do not match');
    setLoading(true); reset();
    try {
      await api.patch('/auth/update', { currentPin, newPin });
      setSuccess('PIN updated 💕');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (confirmDelete !== 'DELETE') return setError('Type DELETE to confirm');
    setLoading(true); reset();
    try {
      await api.delete('/auth/account', { data: { password: deletePassword } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-2xl border border-rose-200 dark:border-rose-800 bg-white/80 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:border-rose-400 text-sm transition-all";
  const btnClass = "w-full py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60 text-sm";

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
        <div className="flex items-center justify-between px-6 py-5 border-b border-rose-100 dark:border-rose-900/50">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Manage Account ⚙️</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-rose-500 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-4">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t
                  ? t === 'Delete'
                    ? 'bg-red-500 text-white'
                    : 'bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm'
                  : 'bg-rose-50 dark:bg-gray-800 text-rose-400 hover:bg-rose-100 dark:hover:bg-gray-700'
              }`}
            >
              {t === 'Delete' ? '🗑️' : ''}{t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Feedback */}
          {success && <p className="text-green-500 text-sm text-center mb-4 animate-fade-in">{success}</p>}
          {error && <p className="text-rose-500 text-sm text-center mb-4 animate-fade-in">{error}</p>}

          {/* Photo tab */}
          {tab === 'Photo' && (
            <div className="flex flex-col items-center gap-5">
              <p className="text-gray-400 dark:text-gray-500 text-xs">Tap the photo to change your profile picture.</p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="relative group focus:outline-none"
                aria-label="Change profile photo"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-4xl shadow-lg overflow-hidden">
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : <span>🌸</span>
                  }
                </div>
                <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-2xl">📷</span>
                </div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-rose-400 to-pink-500 text-white text-sm font-medium disabled:opacity-60"
              >
                {loading ? 'Uploading...' : 'Choose Photo 📷'}
              </button>
            </div>
          )}

          {/* Name tab */}
          {tab === 'Name' && (
            <form onSubmit={handleNameUpdate} className="space-y-4">
              <p className="text-gray-400 dark:text-gray-500 text-xs mb-2">Change how your partner sees your name.</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="New name"
                className={inputClass}
                required
              />
              <button type="submit" disabled={loading} className={`${btnClass} bg-gradient-to-r from-rose-400 to-pink-500 text-white`}>
                {loading ? 'Saving...' : 'Update Name 💕'}
              </button>
            </form>
          )}

          {/* Password tab */}
          {tab === 'Password' && (
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <p className="text-gray-400 dark:text-gray-500 text-xs mb-2">Choose a strong password.</p>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" className={inputClass} required />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" className={inputClass} required minLength={6} />
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputClass} required />
              <button type="submit" disabled={loading} className={`${btnClass} bg-gradient-to-r from-rose-400 to-pink-500 text-white`}>
                {loading ? 'Saving...' : 'Update Password 🔒'}
              </button>
            </form>
          )}

          {/* PIN tab */}
          {tab === 'PIN' && (
            <form onSubmit={handlePinUpdate} className="space-y-4">
              <p className="text-gray-400 dark:text-gray-500 text-xs mb-2">6-digit PIN for quick login.</p>
              <input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Current PIN (6 digits)"
                className={`${inputClass} tracking-widest text-center`}
                required
              />
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="New PIN (6 digits)"
                className={`${inputClass} tracking-widest text-center`}
                required
              />
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Confirm new PIN"
                className={`${inputClass} tracking-widest text-center`}
                required
              />
              <button type="submit" disabled={loading} className={`${btnClass} bg-gradient-to-r from-rose-400 to-pink-500 text-white`}>
                {loading ? 'Saving...' : 'Update PIN 🔐'}
              </button>
            </form>
          )}

          {/* Delete tab */}
          {tab === 'Delete' && (
            <form onSubmit={handleDelete} className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
                <p className="text-red-500 font-semibold text-sm">⚠️ This cannot be undone</p>
                <p className="text-red-400 dark:text-red-500 text-xs mt-1">Your account and all your data will be permanently deleted.</p>
              </div>
              <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Enter your password" className={inputClass} required />
              <input
                type="text"
                value={confirmDelete}
                onChange={e => setConfirmDelete(e.target.value)}
                placeholder='Type DELETE to confirm'
                className={inputClass}
                required
              />
              <button type="submit" disabled={loading} className={`${btnClass} bg-red-500 text-white hover:bg-red-600`}>
                {loading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
