import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import FloatingHearts from '../components/FloatingHearts';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/chat');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <FloatingHearts />
      <div className="text-center z-10">
        <div className="text-6xl animate-pulse-heart mb-4">💕</div>
        <p className="text-rose-400 text-lg font-medium">Loading LoveChat...</p>
      </div>
    </div>
  );
}
