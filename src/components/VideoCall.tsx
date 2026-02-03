"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

interface VideoCallProps {
  socket: Socket;
  roomId: string;
  currentUserId: string;
  users: UserInfo[];
  onClose: () => void;
  initialIncomingCall?: { fromId: string; fromName: string; type: "audio" | "video" } | null;
  onCallHandled?: () => void;
}

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export default function VideoCall({ socket, roomId, currentUserId, users, onClose, initialIncomingCall, onCallHandled }: VideoCallProps) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "incoming" | "connected">("idle");
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string>("");
  const [currentCallType, setCurrentCallType] = useState<"audio" | "video">("video");
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);

  // Keep remoteUserId ref in sync
  useEffect(() => {
    remoteUserIdRef.current = remoteUserId;
  }, [remoteUserId]);

  // Apply remote stream when video/audio elements become available
  useEffect(() => {
    if (remoteStreamRef.current) {
      if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (remoteAudioRef.current && !remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
    }
  }, [callStatus]);

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setIsStreamReady(false);
    setIsAccepting(false);
  }, []);

  const startLocalStream = useCallback(async (callType: "audio" | "video") => {
    try {
      setIsStreamReady(false);
      const constraints = callType === "video"
        ? { video: true, audio: true }
        : { video: false, audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current && callType === "video") {
        localVideoRef.current.srcObject = stream;
      }
      setIsStreamReady(true);
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setIsStreamReady(false);
      alert("Failed to access camera/microphone. Please allow permissions and try again.");
      throw error;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserIdRef.current) {
        socket.emit("webrtc-ice-candidate", {
          roomId,
          targetId: remoteUserIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("ontrack received:", event.streams[0]);
      remoteStreamRef.current = event.streams[0];

      // Set video stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }

      // Set audio stream (for audio-only calls)
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }

      // Mark as connected when we receive remote stream
      setCallStatus("connected");
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setCallStatus("connected");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanup();
        setCallStatus("idle");
        setRemoteUserId(null);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setCallStatus("connected");
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, roomId, cleanup]);

  // Handle initial incoming call from parent (when modal opens with a call)
  useEffect(() => {
    if (initialIncomingCall) {
      setRemoteUserId(initialIncomingCall.fromId);
      setRemoteUserName(initialIncomingCall.fromName);
      setCurrentCallType(initialIncomingCall.type);
      setCallStatus("incoming");

      // Start local stream immediately for incoming call
      const initStream = async () => {
        try {
          await startLocalStream(initialIncomingCall.type);
        } catch (error) {
          console.error("Failed to start stream:", error);
        }
      };
      initStream();
    }
  }, [initialIncomingCall, startLocalStream]);

  const handleCallAccepted = useCallback(async () => {
    if (!remoteUserIdRef.current) return;

    // Ensure local stream is ready before creating peer connection
    if (!localStreamRef.current) {
      try {
        await startLocalStream(currentCallType);
      } catch (error) {
        console.error("Failed to start local stream:", error);
        return;
      }
    }

    const pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("webrtc-offer", {
      roomId,
      targetId: remoteUserIdRef.current,
      offer,
    });
  }, [createPeerConnection, socket, roomId, startLocalStream, currentCallType]);

  const handleCallRejected = useCallback(() => {
    cleanup();
    setCallStatus("idle");
    setRemoteUserId(null);
  }, [cleanup]);

  const handleCallEnded = useCallback(() => {
    cleanup();
    setCallStatus("idle");
    setRemoteUserId(null);
  }, [cleanup]);

  const handleOffer = useCallback(async (data: { fromId: string; fromName: string; offer: RTCSessionDescriptionInit }) => {
    // Ensure local stream is ready before creating peer connection
    if (!localStreamRef.current) {
      try {
        await startLocalStream(currentCallType);
      } catch (error) {
        console.error("Failed to start local stream:", error);
        return;
      }
    }

    if (!peerConnectionRef.current) {
      createPeerConnection();
    }

    const pc = peerConnectionRef.current!;
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      roomId,
      targetId: data.fromId,
      answer,
    });
  }, [createPeerConnection, socket, roomId, startLocalStream, currentCallType]);

  const handleAnswer = useCallback(async (data: { fromId: string; answer: RTCSessionDescriptionInit }) => {
    const pc = peerConnectionRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }, []);

  const handleIceCandidate = useCallback(async (data: { fromId: string; candidate: RTCIceCandidateInit }) => {
    const pc = peerConnectionRef.current;
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }, []);

  useEffect(() => {
    // Socket event handlers
    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-rejected", handleCallRejected);
    socket.on("call-ended", handleCallEnded);
    socket.on("webrtc-offer", handleOffer);
    socket.on("webrtc-answer", handleAnswer);
    socket.on("webrtc-ice-candidate", handleIceCandidate);

    return () => {
      cleanup();
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-rejected", handleCallRejected);
      socket.off("call-ended", handleCallEnded);
      socket.off("webrtc-offer", handleOffer);
      socket.off("webrtc-answer", handleAnswer);
      socket.off("webrtc-ice-candidate", handleIceCandidate);
    };
  }, [socket, cleanup, handleCallAccepted, handleCallRejected, handleCallEnded, handleOffer, handleAnswer, handleIceCandidate]);

  const callUser = async (targetId: string, type: "audio" | "video") => {
    const user = users.find((u) => u.id === targetId);
    if (!user) return;

    setCurrentCallType(type);

    // Start local stream before calling
    try {
      await startLocalStream(type);
    } catch (error) {
      console.error("Failed to start local stream:", error);
      return;
    }

    setRemoteUserId(targetId);
    setRemoteUserName(user.name);
    setCallStatus("calling");

    socket.emit("call-user", { roomId, targetId, type });
  };

  const acceptCall = async () => {
    if (!remoteUserId || isAccepting) return;

    try {
      setIsAccepting(true);

      // Ensure local stream is ready before creating peer connection
      if (!localStreamRef.current || !isStreamReady) {
        console.log("Starting local stream...");
        await startLocalStream(currentCallType);
      }

      console.log("Creating peer connection...");
      createPeerConnection();

      console.log("Emitting call-accepted...");
      socket.emit("call-accepted", { roomId, targetId: remoteUserId });

      setCallStatus("connected");

      // Notify parent that call was handled
      if (onCallHandled) {
        onCallHandled();
      }
    } catch (error) {
      console.error("Failed to accept call:", error);
      alert("Failed to accept call. Please check your permissions and try again.");
    } finally {
      setIsAccepting(false);
    }
  };

  const rejectCall = () => {
    if (remoteUserId) {
      socket.emit("call-rejected", { roomId, targetId: remoteUserId });
    }
    cleanup();
    setCallStatus("idle");
    setRemoteUserId(null);

    // Notify parent that call was handled
    if (onCallHandled) {
      onCallHandled();
    }
  };

  const endCall = () => {
    if (remoteUserId) {
      socket.emit("end-call", { roomId, targetId: remoteUserId });
    }
    cleanup();
    setCallStatus("idle");
    setRemoteUserId(null);
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const otherUsers = users.filter((u) => u.id !== currentUserId);

  // Render audio call UI (no video elements)
  const renderAudioCallUI = (status: "calling" | "incoming" | "connected") => {
    return (
      <div className="py-12">
        {/* Hidden audio element for remote stream */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <div className="flex justify-center gap-8 mb-8">
          {/* Local User */}
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-white text-sm font-medium">You</p>
          </div>

          {/* Remote User */}
          <div className="text-center">
            <div className={`w-24 h-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center ${status === "calling" ? "animate-pulse" : status === "incoming" ? "animate-bounce" : ""}`}>
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-white text-sm font-medium">{remoteUserName}</p>
            {status === "calling" && <p className="text-gray-400 text-xs mt-1">Calling...</p>}
            {status === "incoming" && !isStreamReady && <p className="text-yellow-400 text-xs mt-1">⏳ Requesting mic access...</p>}
            {status === "incoming" && isStreamReady && <p className="text-gray-400 text-xs mt-1">Incoming call...</p>}
            {status === "connected" && <p className="text-emerald-400 text-xs mt-1">Connected</p>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-colors ${isAudioEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-600"}`}
          >
            {isAudioEnabled ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>

          {status === "incoming" ? (
            <>
              <button
                onClick={rejectCall}
                className="p-4 bg-red-600 hover:bg-red-500 rounded-full transition-all"
                disabled={isAccepting}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={acceptCall}
                className={`p-4 rounded-full transition-all ${isAccepting ? "bg-emerald-700 cursor-wait" : "bg-emerald-600 hover:bg-emerald-500"}`}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <button onClick={endCall} className="p-4 bg-red-600 hover:bg-red-500 rounded-full">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render video call UI
  const renderVideoCallUI = (status: "calling" | "incoming" | "connected") => {
    return (
      <div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">You</span>
          </div>
          <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden">
            {/* Always render video element so ontrack can assign stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${status !== "connected" ? "hidden" : ""}`}
            />
            {status !== "connected" && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-full ${status === "calling" ? "bg-violet-600 animate-pulse" : "bg-emerald-600 animate-bounce"} flex items-center justify-center`}>
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <p className="text-white text-sm font-medium mb-1">
                    {status === "calling" ? `Calling ${remoteUserName}...` : `${remoteUserName} is calling...`}
                  </p>
                  <p className="text-gray-400 text-xs">Video call</p>
                  {status === "incoming" && !isStreamReady && (
                    <p className="text-yellow-400 text-xs mt-2">⏳ Requesting camera access...</p>
                  )}
                </div>
              </div>
            )}
            <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">{remoteUserName}</span>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-colors ${isAudioEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-600"}`}
          >
            {isAudioEnabled ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-colors ${isVideoEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-600"}`}
          >
            {isVideoEnabled ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
          </button>

          {status === "incoming" ? (
            <>
              <button
                onClick={rejectCall}
                className="p-4 bg-red-600 hover:bg-red-500 rounded-full transition-all"
                disabled={isAccepting}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={acceptCall}
                className={`p-4 rounded-full transition-all ${isAccepting ? "bg-emerald-700 cursor-wait" : "bg-emerald-600 hover:bg-emerald-500"}`}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <button onClick={endCall} className="p-4 bg-red-600 hover:bg-red-500 rounded-full">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#12121a] rounded-2xl border border-white/10 w-full max-w-4xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h3 className="font-semibold text-white flex items-center gap-2">
            {currentCallType === "video" ? (
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            )}
            {currentCallType === "video" ? "Video Call" : "Audio Call"}
          </h3>
          <button onClick={() => { cleanup(); onClose(); }} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {callStatus === "idle" && (
            <div>
              <p className="text-gray-400 mb-4">Select a user to call:</p>
              <div className="grid grid-cols-2 gap-3">
                {otherUsers.length === 0 ? (
                  <p className="text-gray-500 col-span-2 text-center py-8">No other users in the room</p>
                ) : (
                  otherUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: user.color }}>
                          {user.name[0]}
                        </div>
                        <span className="text-white">{user.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => callUser(user.id, "audio")}
                          className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                          title="Audio call"
                        >
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => callUser(user.id, "video")}
                          className="p-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
                          title="Video call"
                        >
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {callStatus === "calling" && (
            currentCallType === "audio" ? renderAudioCallUI("calling") : renderVideoCallUI("calling")
          )}

          {callStatus === "incoming" && (
            currentCallType === "audio" ? renderAudioCallUI("incoming") : renderVideoCallUI("incoming")
          )}

          {callStatus === "connected" && (
            currentCallType === "audio" ? renderAudioCallUI("connected") : renderVideoCallUI("connected")
          )}
        </div>
      </div>
    </div>
  );
}
