import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useChatStore from '../store/useChatStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const AuthPage = () => {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const setAuthToken = useChatStore(state => state.setAuthToken);
  const setUser = useChatStore(state => state.setUser);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const url = tab === 'login' ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    const payload = tab === 'login' ? { email, password } : { email, password, name };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setAuthToken(data.token);
      setUser(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDemo = () => {
    setAuthToken(null);
    setUser(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-[#0F6E56] p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">FinChatBot</h1>
          <p className="text-[#C6E6DF]">Your AI Financial Analyst</p>
        </div>
        
        <div className="p-8">
          <div className="flex border-b border-gray-200 mb-6 pb-2">
            <button 
              className={`flex-1 font-semibold ${tab === 'login' ? 'text-[#0F6E56] border-b-2 border-[#0F6E56]' : 'text-gray-400'}`}
              onClick={() => setTab('login')}
            >
              Login
            </button>
            <button 
              className={`flex-1 font-semibold ${tab === 'register' ? 'text-[#0F6E56] border-b-2 border-[#0F6E56]' : 'text-gray-400'}`}
              onClick={() => setTab('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  type="text" 
                  autoFocus
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#0F6E56] focus:border-[#0F6E56] outline-none"
                  placeholder="John Doe"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#0F6E56] focus:border-[#0F6E56] outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-[#0F6E56] focus:border-[#0F6E56] outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

            <button 
              type="submit"
              className="w-full bg-[#0F6E56] text-white py-3 rounded-lg font-semibold hover:bg-[#0B4F3E] transition mt-4"
            >
              {tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center">
            <span className="text-gray-400 text-sm">or</span>
          </div>

          <button 
            onClick={handleDemo}
            className="w-full mt-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Continue as Demo
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
