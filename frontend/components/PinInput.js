import { useState, useRef, useEffect } from 'react';

const PIN_LENGTH = 6;

/**
 * iOS-style 6-digit PIN input with dot indicators
 * Shows shake animation on wrong PIN
 */
export default function PinInput({ onComplete, error, disabled }) {
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [shake, setShake] = useState(false);
  const inputs = useRef([]);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin(Array(PIN_LENGTH).fill(''));
      inputs.current[0]?.focus();
      setTimeout(() => setShake(false), 600);
    }
  }, [error]);

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < PIN_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (newPin.every(d => d !== '') && value) {
      onComplete(newPin.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (pasted.length === PIN_LENGTH) {
      const newPin = pasted.split('');
      setPin(newPin);
      inputs.current[PIN_LENGTH - 1]?.focus();
      onComplete(pasted);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-6 ${shake ? 'animate-shake' : ''}`}>
      {/* Dot indicators */}
      <div className="flex gap-3">
        {pin.map((digit, i) => (
          <div
            key={i}
            className={`pin-dot w-3.5 h-3.5 rounded-full border-2 border-rose-300 ${digit ? 'filled' : 'bg-transparent'}`}
          />
        ))}
      </div>

      {/* Inputs */}
      <div className="flex gap-2">
        {pin.map((digit, i) => (
          <input
            key={i}
            ref={el => (inputs.current[i] = el)}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value.slice(-1))}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            disabled={disabled}
            className="w-10 h-12 text-center text-lg font-bold rounded-2xl border-2 border-rose-200 bg-white/70 backdrop-blur focus:outline-none focus:border-rose-400 focus:bg-white transition-all"
            aria-label={`PIN digit ${i + 1}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-rose-500 text-sm font-medium animate-fade-in">{error}</p>
      )}
    </div>
  );
}
