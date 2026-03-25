import { useState, useEffect } from 'react';
import { getRandomQuote } from '../lib/quotes';

// Shows a rotating romantic quote — changes every 30 seconds
export default function DailyQuote() {
  const [quote, setQuote] = useState('');

  useEffect(() => {
    setQuote(getRandomQuote());
    const interval = setInterval(() => setQuote(getRandomQuote()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!quote) return null;

  return (
    <div className="text-center px-4 py-2 animate-fade-in">
      <p className="text-xs text-rose-400 dark:text-rose-300 italic font-medium">{quote}</p>
    </div>
  );
}
