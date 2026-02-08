import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';

const steps = ['Register', 'Verify OTP', 'Pending Approval'];

const languages = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'Sinhala' },
  { code: 'ta', label: 'Tamil' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    preferredLanguage: 'en'
  });
  const [otp, setOtp] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (!/^\d{10}$/.test(form.phone)) {
      toast.error('Phone number must be 10 digits');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        preferredLanguage: form.preferredLanguage,
      });
      toast.success('Registration successful! Please verify the OTP sent to your email.');
      setActiveStep(1);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      toast.error('OTP must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/verify-otp', {
        email: form.email,
        otp,
      });
      toast.success('OTP verified! Your account is pending admin approval.');
      setActiveStep(2);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cp-auth">
      <div className="cp-auth-card">
        <div className="row g-0">
          <div className="col-lg-6 d-none d-lg-block">
            <div className="cp-auth-left h-100">
              <h2 className="fw-bold mb-3">Create your account</h2>
              <p className="opacity-90 mb-4">
                Join the campus Lost &amp; Found system to track devices, manage bookings, and stay informed.
              </p>
              <div className="d-flex gap-2 flex-wrap">
                {steps.map((s, idx) => (
                  <span key={s} className={`badge ${idx <= activeStep ? 'bg-light text-dark' : 'bg-dark border border-light'}`}>{idx + 1}. {s}</span>
                ))}
              </div>
              <div className="mt-4 small opacity-75">
                Already registered? You can sign in anytime.
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="cp-auth-right">
              <div className="d-flex align-items-center justify-content-between mb-4">
                <div>
                  <div className="text-muted small">Step {activeStep + 1} of {steps.length}</div>
                  <h3 className="fw-bold mb-0">{steps[activeStep]}</h3>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: 'linear-gradient(90deg, var(--cp-primary), var(--cp-primary-2))' }} />
                  <span className="fw-bold">Connect+</span>
                </div>
              </div>

              {activeStep === 0 && (
                <form onSubmit={handleRegister}>
                  <div className="mb-3">
                    <label className="form-label">Full name</label>
                    <input className="form-control form-control-lg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={loading} />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Email</label>
                    <input className="form-control form-control-lg" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={loading} />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Phone</label>
                    <input className="form-control form-control-lg" placeholder="10 digits" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required disabled={loading} />
                  </div>

                  <div className="row g-2">
                    <div className="col-md-6">
                      <label className="form-label">Password</label>
                      <input className="form-control form-control-lg" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required disabled={loading} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Confirm</label>
                      <input className="form-control form-control-lg" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required disabled={loading} />
                    </div>
                  </div>

                  <div className="mt-3 mb-4">
                    <label className="form-label">Preferred language</label>
                    <select className="form-select form-select-lg" value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })} disabled={loading}>
                      {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>

                  <button className="btn cp-btn-primary w-100 btn-lg" disabled={loading}>
                    {loading ? (
                      <span className="d-inline-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" role="status" />
                        Creating...
                      </span>
                    ) : 'CREATE ACCOUNT'}
                  </button>

                  <div className="text-center text-muted small mt-3">
                    Already have an account? <Link to="/login" className="fw-semibold">Sign in</Link>
                  </div>
                </form>
              )}

              {activeStep === 1 && (
                <form onSubmit={handleVerifyOtp}>
                  <div className="alert alert-light border" role="alert">
                    We sent a 6-digit OTP to <span className="fw-semibold">{form.email}</span>.
                  </div>
                  <div className="mb-3">
                    <label className="form-label">OTP</label>
                    <input className="form-control form-control-lg" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={loading} required />
                  </div>
                  <button className="btn cp-btn-primary w-100 btn-lg" disabled={loading}>
                    {loading ? (
                      <span className="d-inline-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" role="status" />
                        Verifying...
                      </span>
                    ) : 'VERIFY OTP'}
                  </button>
                  <div className="text-center text-muted small mt-3">
                    Wrong email? <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setActiveStep(0)}>Go back</button>
                  </div>
                </form>
              )}

              {activeStep === 2 && (
                <div>
                  <div className="alert alert-success" role="alert">
                    <div className="fw-bold">All set!</div>
                    Your account is pending admin approval. You’ll be able to log in once approved.
                  </div>
                  <button className="btn btn-outline-dark w-100 btn-lg" onClick={() => navigate('/login')}>
                    Back to Sign in
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
