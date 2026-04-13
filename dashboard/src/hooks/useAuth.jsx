import { useState, useEffect, createContext, useContext } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sf_token');
    if (token) {
      api.setToken(token);
      api.get('/account').then(res => {
        setUser(res.data.user);
        setLoading(false);
      }).catch(() => {
        api.clearToken();
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    api.setToken(res.data.token);
    if (res.data.refreshToken) {
      localStorage.setItem('sf_refresh_token', res.data.refreshToken);
    }
    setUser(res.data.user);
    return res.data;
  };

  const register = async (email, password, name) => {
    const res = await api.post('/auth/register', { email, password, name });
    api.setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
