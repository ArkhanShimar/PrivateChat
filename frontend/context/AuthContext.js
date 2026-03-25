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
    const savedToken = sessionStorage.getItem('lc_token');
    if (savedToken) {
      setToken(savedToken);
      api.get('/auth/me')
        .then(res => {
          const userData = res.data.user;
          // If legacy user (no E2EE keys), force them to re-login to generate them
          if (!userData.publicKey && !userData.encryptedPrivateKey) {
            console.warn('E2EE keys missing for restored session. Forcing re-login.');
            sessionStorage.removeItem('lc_token');
            setToken(null);
          } else {
            const savedPriv = sessionStorage.getItem('lc_priv');
            if (savedPriv) setPrivateKey(savedPriv);
            setUser(userData); // Set user last to trigger dependent effects only when key is ready
          }
        })
        .catch(() => {
          sessionStorage.removeItem('lc_token');
          sessionStorage.removeItem('lc_priv');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const saveAuth = (userData, authToken, privKey) => {
    setUser(userData);
    setToken(authToken);
    if (privKey) {
      setPrivateKey(privKey);
      sessionStorage.setItem('lc_priv', privKey);
    }
    sessionStorage.setItem('lc_token', authToken);
  };

  const register = async (name, password, pin) => {
    // 1. Generate E2EE keys first
    const keys = await generateIdentityKeys();
    // 2. Wrap private key with password (using name as salt for simplicity)
    const encryptedPrivateKey = await wrapPrivateKey(keys.privateKey, password, name);
    
    const res = await api.post('/auth/register', { 
      name, 
      password, 
      pin,
      publicKey: keys.publicKey,
      encryptedPrivateKey
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
        console.error('Failed to unwrap E2EE key:', err);
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

    if (userData.encryptedPrivateKey) {
      try {
        // Try unwrapping with PIN as fallback for quick access
        privKey = await unwrapPrivateKey(userData.encryptedPrivateKey, pin, userData.name);
      } catch (err) {
        console.warn('E2EE key unwrap with PIN failed. Full password might be required for decryption.');
      }
    } else {
      // Legacy user on PIN login: Generate keys using PIN as derivation
      console.log('Generating E2EE keys for legacy user (PIN)...');
      const keys = await generateIdentityKeys();
      const wrapped = await wrapPrivateKey(keys.privateKey, pin, userData.name);
      api.put('/auth/update-profile', { publicKey: keys.publicKey, encryptedPrivateKey: wrapped })
        .catch(err => console.error('Failed to save legacy keys (PIN):', err));
      privKey = keys.privateKey;
      userData.publicKey = keys.publicKey;
      userData.encryptedPrivateKey = wrapped;
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
    sessionStorage.removeItem('lc_token');
    sessionStorage.removeItem('lc_priv');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, privateKey, register, login, pinLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
