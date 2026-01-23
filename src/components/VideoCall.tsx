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
}

const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function VideoCall({ socket, roomId, currentUserId, users, onClose }: VideoCallProps) {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "incoming" | "connected">("idle");
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string>("");
  const [incomingCallType, setIncomingCallType] = useState<"audio" | "video">("video");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);

  // Keep remoteUserId ref in sync
  useEffect(() => {
    remoteUserIdRef.current = remoteUserId;
  }, [remoteUserId]);

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
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
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallStatus("connected");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanup();
        setCallStatus("idle");
        setRemoteUserId(null);
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

  const handleIncomingCall = useCallback((data: { fromId: string; fromName: string; type: "audio" | "video" }) => {
    setRemoteUserId(data.fromId);
    setRemoteUserName(data.fromName);
    setIncomingCallType(data.type);
    setCallStatus("incoming");
  }, []);

  const handleCallAccepted = useCallback(async () => {
    if (!remoteUserIdRef.current) return;

    const pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("webrtc-offer", {
      roomId,
      targetId: remoteUserIdRef.current,
      offer,
    });
  }, [createPeerConnection, socket, roomId]);

  const handleCallRejected = useCallback(() => {
    setCallStatus("idle");
    setRemoteUserId(null);
  }, []);

  const handleCallEnded = useCallback(() => {
    cleanup();
    setCallStatus("idle");
    setRemoteUserId(null);
  }, [cleanup]);

  const handleOffer = useCallback(async (data: { fromId: string; fromName: string; offer: RTCSessionDescriptionInit }) => {
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
  }, [createPeerConnection, socket, roomId]);

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
    // Start local stream
    startLocalStream();

    // Socket event handlers
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-rejected", handleCallRejected);
    socket.on("call-ended", handleCallEnded);
    socket.on("webrtc-offer", handleOffer);
    socket.on("webrtc-answer", handleAnswer);
    socket.on("webrtc-ice-candidate", handleIceCandidate);

    return () => {
      cleanup();
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-rejected", handleCallRejected);
      socket.off("call-ended", handleCallEnded);
      socket.off("webrtc-offer", handleOffer);
      socket.off("webrtc-answer", handleAnswer);
      socket.off("webrtc-ice-candidate", handleIceCandidate);
    };
  }, [socket, startLocalStream, cleanup, handleIncomingCall, handleCallAccepted, handleCallRejected, handleCallEnded, handleOffer, handleAnswer, handleIceCandidate]);

  const callUser = async (targetId: string, type: "audio" | "video") => {
    const user = users.find((u) => u.id === targetId);
    if (!user) return;

    setRemoteUserId(targetId);
    setRemoteUserName(user.name);
    setCallStatus("calling");

    socket.emit("call-user", { roomId, targetId, type });
  };

  const acceptCall = async () => {
    if (!remoteUserId) return;

    createPeerConnection();
    socket.emit("call-accepted", { roomId, targetId: remoteUserId });
    setCallStatus("connected");
  };

  const rejectCall = () => {
    if (remoteUserId) {
      socket.emit("call-rejected", { roomId, targetId: remoteUserId });
    }
    setCallStatus("idle");
    setRemoteUserId(null);
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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#12121a] rounded-2xl border border-white/10 w-full max-w-4xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Video Call
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
                        >
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => callUser(user.id, "video")}
                          className="p-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
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
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-violet-600 flex items-center justify-center animate-pulse">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="text-white text-lg mb-2">Calling {remoteUserName}...</p>
              <button onClick={endCall} className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl">
                Cancel
              </button>
            </div>
          )}

          {callStatus === "incoming" && (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-600 flex items-center justify-center animate-bounce">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="text-white text-lg mb-2">{remoteUserName} is calling...</p>
              <p className="text-gray-400 mb-4">{incomingCallType === "video" ? "Video" : "Audio"} call</p>
              <div className="flex justify-center gap-4">
                <button onClick={rejectCall} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Decline
                </button>
                <button onClick={acceptCall} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Accept
                </button>
              </div>
            </div>
          )}

          {callStatus === "connected" && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                  <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">You</span>
                </div>
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
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
                <button onClick={endCall} className="p-4 bg-red-600 hover:bg-red-500 rounded-full">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
