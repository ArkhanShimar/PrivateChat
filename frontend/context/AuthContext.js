import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { disconnectSocket } from '../lib/socket';
import { generateIdentityKeys, wrapPrivateKey, unwrapPrivateKey } from '../lib/crypto';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privateKey, setPrivateKey] = useState(null);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('lc_token');
    if (savedToken) {
      setToken(savedToken);
      api.get('/auth/me')
        .then(res => {
          const userData = res.data.user;
          // If legacy user (no E2EE keys), force them to re-login to generate them
          if (!userData.publicKey && !userData.encryptedPrivateKey) {
            console.warn('E2EE keys missing for restored session. Forcing re-login.');
            localStorage.removeItem('lc_token');
            setToken(null);
          } else {
            const savedPriv = localStorage.getItem('lc_priv');
            console.log('🗝️ Restoring privateKey from localStorage:', !!savedPriv);
            if (savedPriv) {
              setPrivateKey(savedPriv);
              setUser(userData);
            } else {
              // Limited session: User is logged in but has no encryption key.
              // For "LoveChat", we'd rather force a re-login than show "[Encrypted Message]"
              console.warn('🔐 Identity key missing from storage. Forcing re-login for security.');
              localStorage.removeItem('lc_token');
              setToken(null);
              setUser(null);
            }
          }
        })
        .catch(() => {
          localStorage.removeItem('lc_token');
          localStorage.removeItem('lc_priv');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const saveAuth = (userData, authToken, privKey) => {
    console.log('💾 Saving auth state...', { hasPriv: !!privKey });
    setUser(userData);
    setToken(authToken);
    if (privKey) {
      setPrivateKey(privKey);
      localStorage.setItem('lc_priv', privKey);
    }
    localStorage.setItem('lc_token', authToken);
  };

  const register = async (name, password, pin) => {
    // 1. Generate E2EE keys first
    const keys = await generateIdentityKeys();
    // 2. Wrap private key with password (using name as salt for simplicity)
    const encryptedPrivateKey = await wrapPrivateKey(keys.privateKey, password, name);
    
    // 3. Wrap private key with PIN too
    const encryptedPrivateKeyPin = await wrapPrivateKey(keys.privateKey, pin, name);
    
    const res = await api.post('/auth/register', { 
      name, 
      password, 
      pin,
      publicKey: keys.publicKey,
      encryptedPrivateKey,
      encryptedPrivateKeyPin
    });
    
    saveAuth(res.data.user, res.data.token, keys.privateKey);
    return res.data;
  };

  const login = async (password) => {
    const res = await api.post('/auth/login', { password });
    const userData = res.data.user;
    
    let privKey = null;
    
    // Unwrap the private key using the password
    if (userData.encryptedPrivateKey) {
      try {
        privKey = await unwrapPrivateKey(userData.encryptedPrivateKey, password, userData.name);
      } catch (err) {
        console.error('❌ Failed to unwrap E2EE key with provided password:', err);
        // Universal FIX: If unwrapping fails but login is valid, the current key is technically "lost".
        // Instead of leaving the user in a broken state, we REGENERATE and save new keys.
        console.log('🔄 Regenerating new E2EE keys to restore secure connectivity...');
        const keys = await generateIdentityKeys();
        const wrappedP = await wrapPrivateKey(keys.privateKey, password, userData.name);
        
        await api.put('/auth/update-profile', { 
          publicKey: keys.publicKey, 
          encryptedPrivateKey: wrappedP 
        }).catch(e => console.error('Failed to sync regenerated keys:', e));

        const savedToken = localStorage.getItem('lc_token');
        if (savedToken) {
          const { getSocket } = require('../lib/socket');
          const socket = getSocket(savedToken);
          socket.emit('keys_updated');
        }
        
        privKey = keys.privateKey;
        userData.publicKey = keys.publicKey;
        userData.encryptedPrivateKey = wrappedP;
      }
    } else {
      // Legacy user: Generate keys now and save to server
      console.log('Generating E2EE keys for legacy user...');
      const keys = await generateIdentityKeys();
      const wrapped = await wrapPrivateKey(keys.privateKey, password, userData.name);
      api.put('/auth/update-profile', { publicKey: keys.publicKey, encryptedPrivateKey: wrapped })
        .catch(err => console.error('Failed to save legacy keys:', err));
      privKey = keys.privateKey;
      userData.publicKey = keys.publicKey;
      userData.encryptedPrivateKey = wrapped;
    }
    
    saveAuth(userData, res.data.token, privKey);
    return res.data;
  };

  const pinLogin = async (pin) => {
    const res = await api.post('/auth/pin-login', { pin });
    const userData = res.data.user;

    let privKey = null;

    if (userData.encryptedPrivateKeyPin) {
      try {
        privKey = await unwrapPrivateKey(userData.encryptedPrivateKeyPin, pin, userData.name);
      } catch (err) {
        console.warn('E2EE key unwrap with PIN failed:', err);
      }
    } else if (userData.encryptedPrivateKey) {
      // Fallback to password-wrapped key (might fail if PIN != password, but we try)
      try {
        privKey = await unwrapPrivateKey(userData.encryptedPrivateKey, pin, userData.name);
      } catch (err) {
        console.warn('E2EE key unwrap with PIN failed (no PIN-wrapped key found). Auto-regenerating...');
      }
    }

    if (!privKey) {
      // Universal Fix: If we still have no key after trying all wraps, generate a NEW one.
      // This ensures the user is "Secured" immediately even if they only use PIN.
      console.log('Generating NEW E2EE keys for seamless PIN-only migration...');
      const keys = await generateIdentityKeys();
      const wrappedPin = await wrapPrivateKey(keys.privateKey, pin, userData.name);
      
      // Save new keys to server (silently if possible, or just keep locally if it fails)
      api.put('/auth/update-profile', { 
        publicKey: keys.publicKey, 
        encryptedPrivateKeyPin: wrappedPin 
      }).catch(err => console.error('Failed to sync new PIN keys to server:', err));
      
      privKey = keys.privateKey;
      userData.publicKey = keys.publicKey;
      userData.encryptedPrivateKeyPin = wrappedPin;
    }

    saveAuth(userData, res.data.token, privKey);
    return res.data;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    disconnectSocket();
    setUser(null);
    setToken(null);
    setPrivateKey(null);
    localStorage.removeItem('lc_token');
    localStorage.removeItem('lc_priv');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, privateKey, register, login, pinLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
