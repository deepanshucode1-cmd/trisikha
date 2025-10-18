'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (data.error) alert(data.error);
    else router.push('/dashboard');
  }

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4 p-6 max-w-sm mx-auto">
      <input
        className="border rounded p-2"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border rounded p-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="bg-[#3d3c30] text-[#e0dbb5] py-2 rounded">Login</button>
    </form>
  );
}
