import { useEffect, useRef, useState } from 'react';

export default function AudioCall({ socket, callState, partner, partnerName, onEnd }) {
  const [status, setStatus] = useState(callState.type === 'incoming' ? 'ringing' : 'dialing');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  const localStreamRef = useRef(null);
  const peerRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const iceQueue = useRef([]);

  const displayAvatar = callState.type === 'incoming' ? callState.from?.avatar : partner?.avatar;
  const displayName = callState.type === 'incoming' ? (callState.from?.name || 'Partner') : (partnerName || 'System Access');

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
    if (peerRef.current?._cleanupListeners) peerRef.current._cleanupListeners();
  };

  const endCallUI = () => {
    cleanup();
    onEnd();
  };

  const callingRef = useRef(false);

  useEffect(() => {
    if (callState.type === 'outgoing' && !callingRef.current) {
      callingRef.current = true;
      initCall();
    }
    
    const handleReject = () => {
      alert('Call declined');
      endCallUI();
    };
    
    const handleEnd = () => {
      endCallUI();
    };

    socket.on('call_rejected', handleReject);
    socket.on('call_ended', handleEnd);

    return () => {
      socket.off('call_rejected', handleReject);
      socket.off('call_ended', handleEnd);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const initCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      
      // Use Google STUN servers for NAT traversal routing natively bypassing manual proxy requirements
      const rtc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerRef.current = rtc;

      stream.getTracks().forEach(t => rtc.addTrack(t, stream));

      rtc.ontrack = (e) => {
        if (audioRef.current && e.streams[0]) {
          audioRef.current.srcObject = e.streams[0];
        }
      };

      rtc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice_candidate', { candidate: e.candidate });
      };

      const handleIce = ({ candidate }) => {
        if (rtc.remoteDescription && rtc.remoteDescription.type) {
          rtc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        } else {
          iceQueue.current.push(candidate);
        }
      };
      
      socket.on('ice_candidate', handleIce);
      let cleanupIce = () => socket.off('ice_candidate', handleIce);
      let cleanupAns = null;

      if (callState.type === 'outgoing') {
        const handleAnswer = async ({ answer }) => {
          await rtc.setRemoteDescription(new RTCSessionDescription(answer));
          iceQueue.current.forEach(c => rtc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
          iceQueue.current = [];
          setStatus('connected');
        };
        socket.on('call_accepted', handleAnswer);
        cleanupAns = () => socket.off('call_accepted', handleAnswer);

        const offer = await rtc.createOffer();
        await rtc.setLocalDescription(offer);
        socket.emit('call_user', { offer });
      } else {
        // Incoming accept logic
        const { offer } = callState;
        await rtc.setRemoteDescription(new RTCSessionDescription(offer));
        iceQueue.current.forEach(c => rtc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
        iceQueue.current = [];
        
        const answer = await rtc.createAnswer();
        await rtc.setLocalDescription(answer);
        socket.emit('answer_call', { answer });
        setStatus('connected');
      }

      peerRef.current._cleanupListeners = () => {
        cleanupIce();
        if (cleanupAns) cleanupAns();
      };
    } catch (err) {
      console.error('Mic access failed:', err);
      // Drop aggressive browser alerts directly in the async catch to prevent blocking
      socket.emit(callState.type === 'incoming' ? 'reject_call' : 'end_call');
      endCallUI();
    }
  };

  const handleAccept = () => {
    if (callingRef.current) return;
    callingRef.current = true;
    setStatus('connecting...');
    initCall();
  };

  const handleRejectClick = () => {
    socket.emit('reject_call');
    endCallUI();
  };

  const handleHangup = () => {
    socket.emit('end_call');
    endCallUI();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
        setIsMuted(!t.enabled);
      });
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-white animate-fade-in">
      <audio ref={audioRef} autoPlay playsInline />
      
      <div className="w-32 h-32 rounded-full overflow-hidden border-[6px] border-rose-500 mb-6 shadow-[0_0_40px_rgba(244,63,94,0.5)] relative">
        <div className="w-full h-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-5xl">
          {displayAvatar ? <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" /> : '🌸'}
        </div>
      </div>
      
      <h2 className="text-3xl font-bold mb-2 tracking-wide">{displayName}</h2>
      
      <p className="text-gray-400 mb-16 text-lg font-medium tracking-widest uppercase">
        {status === 'dialing' && 'Calling...'}
        {status === 'ringing' && 'Incoming Audio Call...'}
        {status === 'connecting...' && 'Connecting...'}
        {status === 'connected' && formatTime(duration)}
      </p>

      <div className="flex gap-10">
        {status === 'ringing' ? (
          <>
            <button onClick={handleRejectClick} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-red-500/20 text-2xl">
              📞
            </button>
            <button onClick={handleAccept} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center hover:scale-110 transition-transform animate-pulse shadow-lg shadow-green-500/20 text-2xl">
              📞
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} className={`w-16 h-16 rounded-full flex items-center justify-center hover:scale-110 transition-transform text-2xl ${isMuted ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button onClick={handleHangup} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-red-500/20 text-2xl">
              📞
            </button>
          </>
        )}
      </div>
    </div>
  );
}
