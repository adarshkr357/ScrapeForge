import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const result = await register(email, password, name);
        toast.success('Account created! API key: ' + result.api_key?.substring(0, 20) + '...');
      } else {
        await login(email, password);
        toast.success('Welcome back!');
      }
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--sf-bg-primary)',
      padding: 20,
    }}>
      {/* Background gradient orbs */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-20%', right: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />

      <div className="glass-card" style={{
        maxWidth: 440, width: '100%',
        padding: 40,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'var(--sf-gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 22, color: 'white',
          }}>SF</div>
          <h1 style={{
            fontSize: 28, fontWeight: 800,
            background: 'var(--sf-gradient-primary)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>ScrapeForge</h1>
          <p style={{ color: 'var(--sf-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {isRegister ? 'Create your account' : 'Sign in to your dashboard'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--sf-text-secondary)', display: 'block', marginBottom: 6 }}>
                Name
              </label>
              <input className="input" type="text" value={name}
                onChange={e => setName(e.target.value)} placeholder="John Doe" required />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--sf-text-secondary)', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input className="input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--sf-text-secondary)', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
              minLength={isRegister ? 8 : 1} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', fontSize: 15 }}>
            {loading ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button style={{
            background: 'none', border: 'none', color: 'var(--sf-primary-light)',
            cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
          }} onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
