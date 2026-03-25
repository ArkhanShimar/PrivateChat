import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import Link from 'next/link';

export default function Register() {
  const { register, user } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', password: '', pin: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canRegister, setCanRegister] = useState(true);

  useEffect(() => {
    if (user) { router.replace('/chat'); return; }
    // Check if registration is still open
    api.get('/auth/status').then(res => {
      setCanRegister(res.data.canRegister);
    }).catch(() => {});
  }, [user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.pin.length !== 6 || !/^\d{6}$/.test(form.pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    setLoading(true);
    try {
      await register(form.name, form.password, form.pin);
      router.push('/chat');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (!canRegister) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200 w-full max-w-sm text-center">
          <h2 className="text-xl font-medium text-gray-800 mb-2">Registration Closed</h2>
          <p className="text-gray-500 text-xs mb-6">System capacity reached. No further operator profiles can be created.</p>
          <Link href="/login" className="text-gray-800 font-medium hover:underline text-sm md:text-xs">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-medium text-gray-800">System Initialization</h1>
          <p className="text-gray-500 text-xs mt-1">Create new operator profile</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Operator Alias</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Enter alias"
              required
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:border-gray-500 text-sm transition-all text-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Secure Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Minimum 6 characters"
              required
              minLength={6}
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:border-gray-500 text-sm transition-all text-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">6-Digit Access PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              placeholder="••••••"
              required
              maxLength={6}
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:border-gray-500 text-sm tracking-widest text-center transition-all text-gray-800"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-gray-800 text-white font-medium text-sm hover:bg-gray-700 transition-all disabled:opacity-60 mt-2"
          >
            {loading ? 'Initializing...' : 'Initialize Profile'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6 border-t border-gray-100 pt-4">
          System already initialized?{' '}
          <Link href="/login" className="text-gray-600 font-semibold hover:underline">
            Proceed to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
