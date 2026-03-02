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
      toast.success('Login successful!');
      navigate('/admin/users', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="cp-auth">
      <div className="cp-auth-card">
        <div className="row g-0">
          <div className="col-lg-6 d-none d-lg-block">
            <div className="cp-auth-left h-100">
              <h2 className="fw-bold mb-3">Admin Access</h2>
              <p className="opacity-90 mb-4">
                Sign in with your admin credentials to manage users, zones, and approvals.
              </p>
              <div className="d-flex gap-2 align-items-center">
                <span className="badge bg-light text-dark">Lost &amp; Found</span>
                <span className="badge bg-light text-dark">SLIIT</span>
                <span className="badge bg-light text-dark">Admin Panel</span>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="cp-auth-right">
              <div className="d-flex align-items-center justify-content-between mb-4">
                <div>
                  <div className="text-muted small">Administration</div>
                  <h3 className="fw-bold mb-0">Admin Sign In</h3>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="logo-dot" style={{ width: 10, height: 10, borderRadius: 999, background: 'linear-gradient(90deg, var(--cp-primary), var(--cp-primary-2))' }} />
                  <span className="fw-bold">Connect+</span>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    className="form-control form-control-lg"
                    type="email"
                    placeholder="admin@example.com"
                    value={form.email}
                    disabled={loading}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    className="form-control form-control-lg"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    disabled={loading}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>

                <button className="btn cp-btn-primary w-100 btn-lg mt-2" disabled={loading}>
                  {loading ? (
                    <span className="d-inline-flex align-items-center gap-2">
                      <span className="spinner-border spinner-border-sm" role="status" />
                      Signing in...
                    </span>
                  ) : (
                    'SIGN IN AS ADMIN'
                  )}
                </button>
              </form>

              <div className="text-center text-muted small mt-4">
                This login is for administrators only.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
