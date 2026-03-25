import Link from 'next/link';
import FloatingHearts from '../components/FloatingHearts';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <FloatingHearts />
      <div className="text-center z-10">
        <div className="text-6xl mb-4">💔</div>
        <h1 className="text-2xl font-bold text-rose-500 mb-2">Page not found</h1>
        <p className="text-gray-400 mb-6">This page doesn't exist, but our love does 💕</p>
        <Link href="/" className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-6 py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all">
          Go Home ❤️
        </Link>
      </div>
    </div>
  );
}
