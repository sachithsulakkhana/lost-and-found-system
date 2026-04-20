import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="cp-auth">
      <div className="cp-auth-card">
        <div className="cp-auth-inner">
          <div className="cp-auth-logo">
            <div className="logo-icon">R</div>
            <h2>Sign in to continue</h2>
            <p>Find what's lost. Return what's found.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email address</label>
              <input
                className="form-control"
                type="email"
                placeholder="you@sliit.lk"
                value={form.email}
                disabled={loading}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div className="mb-4">
              <label className="form-label">Password</label>
              <input
                className="form-control"
                type="password"
                placeholder="••••••••"
                value={form.password}
                disabled={loading}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            <button className="btn cp-btn-primary w-100" style={{ padding: '.7rem', fontSize: '.9rem' }} disabled={loading}>
              {loading ? (
                <span className="d-inline-flex align-items-center gap-2">
                  <span className="spinner-border spinner-border-sm" role="status" />
                  Signing in...
                </span>
              ) : (
                <>
                  <i className="mdi mdi-login me-2" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-4" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '.78rem' }}>
            <i className="mdi mdi-shield-check me-1" />
            Your data is encrypted and never shared.
          </div>
        </div>
      </div>
    </div>
  );
}
