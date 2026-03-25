import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import PinInput from '../components/PinInput';
import Link from 'next/link';
import api from '../lib/api';

export default function Login() {
  const { login, pinLogin, user } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState('pin'); // 'pin' | 'password'
  const [password, setPassword] = useState('');
  const [pinError, setPinError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false); // lovable transition
  const [heartsData, setHeartsData] = useState([]);
  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => {
    if (user && !isUnlocking) {
      router.replace('/chat');
    }
    
    // Check if registration is open
    api.get('/auth/status')
      .then(res => setCanRegister(res.data.canRegister))
      .catch(() => {});
  }, [user, router, isUnlocking]);

  const handleSuccess = () => {
    const newHearts = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.2 + Math.random() * 1,
      tx: 10 + Math.random() * 30, // wind blows right
      ty: -100 - Math.random() * 50, // upwards
      rot: -45 + Math.random() * 90,
      scale: 0.5 + Math.random() * 1.5,
      emoji: ['❤️', '💖', '💕', '🌸'][i % 4]
    }));
    setHeartsData(newHearts);
    setIsUnlocking(true);
    setTimeout(() => {
      router.push('/chat');
    }, 2000);
  };

  const handlePinComplete = async (pin) => {
    setLoading(true);
    setPinError('');
    try {
      await pinLogin(pin);
      handleSuccess();
    } catch {
      setPinError('Invalid PIN.');
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);
    try {
      await login(password);
      handleSuccess();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Login failed');
      setLoading(false);
    }
  };

  if (isUnlocking) {
    return (
      <div className="fixed inset-0 bg-white overflow-hidden z-50">
        {heartsData.map(h => (
          <div
            key={h.id}
            className="absolute will-change-transform"
            style={{
              left: `${h.x}vw`,
              bottom: `-50px`,
              fontSize: `${h.scale * 2}rem`,
              '--tx': `${h.tx}vw`,
              '--ty': `${h.ty}vh`,
              '--rot': `${h.rot}deg`,
              animation: `windBlow ${h.duration}s ease-out ${h.delay}s forwards`,
              opacity: 0
            }}
          >
            {h.emoji}
          </div>
        ))}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes windBlow {
            0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.5); opacity: 0; }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-medium text-gray-800">System Access</h1>
          <p className="text-gray-500 text-xs mt-1">Please authenticate to continue.</p>
        </div>

        {mode === 'pin' && (
          <div className="flex flex-col items-center">
            <PinInput
              onComplete={handlePinComplete}
              error={pinError}
              disabled={loading}
            />
          </div>
        )}

        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter Password"
              required
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:border-gray-500 text-sm transition-all text-gray-800"
            />
            {formError && (
              <p className="text-red-500 text-xs text-center">{formError}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md bg-gray-800 text-white font-medium text-sm hover:bg-gray-700 transition-all disabled:opacity-60"
            >
              {loading ? 'Authenticating...' : 'Submit'}
            </button>
          </form>
        )}

        <button
          onClick={() => setMode(m => m === 'pin' ? 'password' : 'pin')}
          className="w-full mt-6 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {mode === 'pin' ? 'Use password instead' : 'Use PIN instead'}
        </button>

        {canRegister && (
          <p className="text-center text-xs text-gray-400 mt-4 border-t border-gray-100 pt-4">
            System uninitialized.{' '}
            <Link href="/register" className="text-gray-600 font-semibold hover:underline">
              Create operator profile
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
