import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.signIn({ email, password });
      login(res.token, res.user, res.tenant);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="bg-card rounded-2xl border border-border p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white">Katab</h1>
            <p className="text-muted text-sm mt-1">Cloud Orchestrator</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 text-red-400 text-xs p-3 rounded-lg border border-red-500/20">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm placeholder-muted/50 focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm placeholder-muted/50 focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-muted mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-accent hover:underline">Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
