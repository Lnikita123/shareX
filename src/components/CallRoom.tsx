"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSocket, waitForConnection } from "@/lib/socket";
import { getIceServers } from "@/lib/webrtc-config";
import ConnectionStatus from "./ConnectionStatus";
import type { Socket } from "socket.io-client";

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  message: string;
  timestamp: number;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  userName: string;
  userColor: string;
  x: number;
}

interface CallRoomProps {
  roomId: string;
  callType: "audio" | "video";
}

const EMOJIS = ["👍", "👏", "❤️", "😂", "😮", "🎉", "🔥", "💯"];
const CONNECTION_TIMEOUT = 30000;

export default function CallRoom({ roomId, callType }: CallRoomProps) {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callStatus, setCallStatus] = useState<"connecting" | "waiting" | "connected" | "error">("connecting");
  const [remoteUserName, setRemoteUserName] = useState<string>("");
  const [isStreamReady, setIsStreamReady] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const userInfoRef = useRef<UserInfo | null>(null);
  const showChatRef = useRef(false);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync without triggering re-renders
  useEffect(() => { userInfoRef.current = userInfo; }, [userInfo]);
  useEffect(() => { showChatRef.current = showChat; }, [showChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const startConnectionTimeout = useCallback(() => {
    clearConnectionTimeout();
    connectionTimeoutRef.current = setTimeout(() => {
      if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== "connected") {
        setCallStatus("error");
        setConnectionError("Connection timed out. The other user may have connectivity issues.");
      }
    }, CONNECTION_TIMEOUT);
  }, [clearConnectionTimeout]);

  const cleanup = useCallback(() => {
    clearConnectionTimeout();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    remoteUserIdRef.current = null;
    pendingCandidatesRef.current = [];
    setIsStreamReady(false);
  }, [clearConnectionTimeout]);

  const startLocalStream = useCallback(async () => {
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
  }, [callType]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(getIceServers());

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserIdRef.current && socketRef.current) {
        socketRef.current.emit("webrtc-ice-candidate", {
          roomId,
          targetId: remoteUserIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      clearConnectionTimeout();
      setCallStatus("connected");
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearConnectionTimeout();
        setCallStatus("connected");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanup();
        setCallStatus("waiting");
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        clearConnectionTimeout();
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
  }, [roomId, cleanup, clearConnectionTimeout]);

  // Main socket effect — stable deps only (roomId, callType)
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const socket = await waitForConnection();
      if (!mounted) return;
      socketRef.current = socket;

      socket.emit("join-call-room", { roomId, callType });

      socket.on("call-room-data", async (data: {
        users: UserInfo[];
        messages: ChatMessage[];
        userInfo: UserInfo;
      }) => {
        if (!mounted) return;
        setUsers(data.users);
        setMessages(data.messages);
        setUserInfo(data.userInfo);
        userInfoRef.current = data.userInfo;

        try {
          await startLocalStream();
          if (!mounted) return;
          setCallStatus("waiting");

          const otherUsers = data.users.filter(u => u.id !== data.userInfo.id);
          if (otherUsers.length > 0) {
            const targetUser = otherUsers[0];
            remoteUserIdRef.current = targetUser.id;
            setRemoteUserName(targetUser.name);

            // Deterministic offerer: smaller socket ID creates offer
            if (data.userInfo.id < targetUser.id && localStreamRef.current) {
              const pc = createPeerConnection();
              startConnectionTimeout();
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit("webrtc-offer", {
                roomId,
                targetId: targetUser.id,
                offer,
              });
            }
            // else: wait for the other peer to send offer
          }
        } catch (error) {
          console.error("Failed to start local stream:", error);
        }
      });

      socket.on("user-joined-call", async (data: { user: UserInfo; users: UserInfo[] }) => {
        if (!mounted) return;
        setUsers(data.users);

        const currentInfo = userInfoRef.current;
        if (currentInfo && data.user.id !== currentInfo.id && !peerConnectionRef.current) {
          remoteUserIdRef.current = data.user.id;
          setRemoteUserName(data.user.name);

          // Deterministic offerer: smaller socket ID creates offer
          if (currentInfo.id < data.user.id && localStreamRef.current) {
            const pc = createPeerConnection();
            startConnectionTimeout();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc-offer", {
              roomId,
              targetId: data.user.id,
              offer,
            });
          }
        }
      });

      socket.on("user-left-call", (data: { userId: string; users: UserInfo[] }) => {
        if (!mounted) return;
        setUsers(data.users);
        if (data.userId === remoteUserIdRef.current) {
          cleanup();
          setCallStatus("waiting");
        }
      });

      socket.on("webrtc-offer", async (data: { fromId: string; fromName: string; offer: RTCSessionDescriptionInit }) => {
        if (!mounted) return;
        remoteUserIdRef.current = data.fromId;
        setRemoteUserName(data.fromName);

        if (!localStreamRef.current) {
          try {
            await startLocalStream();
          } catch (error) {
            console.error("Failed to start local stream:", error);
            return;
          }
        }

        const pc = createPeerConnection();
        startConnectionTimeout();
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Flush pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("webrtc-answer", {
          roomId,
          targetId: data.fromId,
          answer,
        });
      });

      socket.on("webrtc-answer", async (data: { fromId: string; answer: RTCSessionDescriptionInit }) => {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
        }
      });

      socket.on("webrtc-ice-candidate", async (data: { fromId: string; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          pendingCandidatesRef.current.push(data.candidate);
        }
      });

      socket.on("new-message", (message: ChatMessage) => {
        if (!mounted) return;
        setMessages((prev) => [...prev, message]);
        if (!showChatRef.current) {
          setUnreadMessages((prev) => prev + 1);
        }
      });

      socket.on("emoji-reaction", (data: { emoji: string; userName: string; userColor: string }) => {
        if (!mounted) return;
        const id = `${Date.now()}-${Math.random()}`;
        const x = Math.random() * 80 + 10;
        setFloatingEmojis((prev) => [...prev, { id, emoji: data.emoji, userName: data.userName, userColor: data.userColor, x }]);
        setTimeout(() => {
          setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
        }, 3000);
      });
    };

    init();

    return () => {
      mounted = false;
      cleanup();
      const socket = socketRef.current;
      if (socket) {
        socket.emit("leave-call-room", roomId);
        socket.off("call-room-data");
        socket.off("user-joined-call");
        socket.off("user-left-call");
        socket.off("webrtc-offer");
        socket.off("webrtc-answer");
        socket.off("webrtc-ice-candidate");
        socket.off("new-message");
        socket.off("emoji-reaction");
      }
    };
  }, [roomId, callType, startLocalStream, createPeerConnection, cleanup, startConnectionTimeout]);

  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current && callType === "video") {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callStatus, callType, isStreamReady]);

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

  const endCall = () => {
    cleanup();
    router.push("/");
  };

  const retryConnection = () => {
    cleanup();
    setConnectionError(null);
    setCallStatus("connecting");
    // Re-init will happen via the useEffect
    window.location.reload();
  };

  const copyShareLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          window.prompt("Copy this link:", url);
        }
      }
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMessage.trim() && socketRef.current) {
      socketRef.current.emit("chat-message", { roomId, message: chatMessage });
      setChatMessage("");
    }
  };

  const sendEmoji = (emoji: string) => {
    if (socketRef.current && userInfo) {
      socketRef.current.emit("emoji-reaction", { roomId, emoji });
      setShowEmojiPicker(false);
    }
  };

  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setUnreadMessages(0);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 bg-[#12121a] border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-lg sm:text-xl font-bold hover:opacity-80 transition-opacity"
          >
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              CodeNest
            </span>
          </button>
          <ConnectionStatus />
          <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">
            {callType === "video" ? "Video Call" : "Audio Call"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex -space-x-2 mr-2">
            {users.slice(0, 4).map((user) => (
              <div
                key={user.id}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-[#12121a]"
                style={{ backgroundColor: user.color }}
                title={user.name}
              >
                {user.name[0]}
              </div>
            ))}
          </div>

          <button
            onClick={copyShareLink}
            className={`flex items-center gap-2 px-3 py-1.5 text-white text-xs sm:text-sm font-medium rounded-lg transition-all ${
              copied
                ? "bg-emerald-600"
                : "bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
            }`}
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
          </button>

          <button
            onClick={endCall}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs sm:text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Video/Audio Area */}
        <div className={`flex-1 flex flex-col ${showChat ? "hidden sm:flex sm:w-2/3 lg:w-3/4" : "w-full"}`}>
          {/* Floating Emojis */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {floatingEmojis.map((fe) => (
              <div
                key={fe.id}
                className="absolute animate-float-up"
                style={{ left: `${fe.x}%`, bottom: 0 }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-4xl sm:text-5xl">{fe.emoji}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: fe.userColor, color: "white" }}>
                    {fe.userName}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Error State */}
          {callStatus === "error" && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-white text-lg font-semibold mb-2">Connection Failed</h3>
                <p className="text-gray-400 text-sm mb-4">{connectionError || "Could not establish a peer connection."}</p>
                <button
                  onClick={retryConnection}
                  className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Video Grid */}
          {callStatus !== "error" && (
            <div className="flex-1 p-3 sm:p-6">
              {callType === "video" ? (
                <div className="h-full grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!isStreamReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center">
                          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-gray-400 text-sm">Starting camera...</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <span className="px-2 py-1 bg-black/60 rounded text-white text-xs sm:text-sm">
                        You {userInfo?.name ? `(${userInfo.name})` : ""}
                      </span>
                      {!isVideoEnabled && (
                        <span className="px-2 py-1 bg-red-600/80 rounded text-white text-xs">Camera off</span>
                      )}
                    </div>
                  </div>

                  <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={`w-full h-full object-cover ${callStatus !== "connected" ? "hidden" : ""}`}
                    />
                    {callStatus !== "connected" && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <div className={`w-16 h-16 mx-auto mb-3 rounded-full bg-violet-600 flex items-center justify-center ${callStatus === "waiting" ? "animate-pulse" : ""}`}>
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <p className="text-white text-sm font-medium mb-1">
                            {callStatus === "connecting" ? "Connecting..." : "Waiting for others..."}
                          </p>
                          <p className="text-gray-400 text-xs">Share the link to invite</p>
                        </div>
                      </div>
                    )}
                    <span className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded text-white text-xs sm:text-sm">
                      {remoteUserName || "Participant"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                  <div className="flex flex-col items-center">
                    <div className="flex gap-8 sm:gap-12 mb-8">
                      <div className="text-center">
                        <div className={`w-20 h-20 sm:w-28 sm:h-28 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center ${!isAudioEnabled ? "ring-4 ring-red-500" : ""}`}>
                          {userInfo ? (
                            <span className="text-2xl sm:text-4xl font-bold text-white">{userInfo.name[0]}</span>
                          ) : (
                            <svg className="w-10 h-10 sm:w-14 sm:h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                        <p className="text-white text-sm sm:text-base font-medium">{userInfo?.name || "You"}</p>
                        {!isAudioEnabled && <p className="text-red-400 text-xs mt-1">Muted</p>}
                      </div>

                      <div className="text-center">
                        <div className={`w-20 h-20 sm:w-28 sm:h-28 mx-auto mb-3 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center ${callStatus === "waiting" ? "animate-pulse" : callStatus === "connected" ? "" : "opacity-50"}`}>
                          {remoteUserName ? (
                            <span className="text-2xl sm:text-4xl font-bold text-white">{remoteUserName[0]}</span>
                          ) : (
                            <svg className="w-10 h-10 sm:w-14 sm:h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                        <p className="text-white text-sm sm:text-base font-medium">{remoteUserName || "Waiting..."}</p>
                        {callStatus === "waiting" && <p className="text-gray-400 text-xs mt-1">Waiting to join</p>}
                        {callStatus === "connected" && <p className="text-emerald-400 text-xs mt-1">Connected</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="p-4 sm:p-6 flex justify-center items-center gap-3 sm:gap-4 bg-[#12121a]/80">
            <button
              onClick={toggleAudio}
              className={`p-3 sm:p-4 rounded-full transition-colors ${isAudioEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-600"}`}
              title={isAudioEnabled ? "Mute" : "Unmute"}
            >
              {isAudioEnabled ? (
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>

            {callType === "video" && (
              <button
                onClick={toggleVideo}
                className={`p-3 sm:p-4 rounded-full transition-colors ${isVideoEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-600"}`}
                title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {isVideoEnabled ? (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-3 sm:p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                title="Send reaction"
              >
                <span className="text-xl">😀</span>
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 bg-[#1a1a24] rounded-xl border border-white/10 shadow-xl">
                  <div className="flex gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => sendEmoji(emoji)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-2xl"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleChat}
              className={`relative p-3 sm:p-4 rounded-full transition-colors ${showChat ? "bg-violet-600" : "bg-white/10 hover:bg-white/20"}`}
              title="Toggle chat"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              onClick={endCall}
              className="p-3 sm:p-4 bg-red-600 hover:bg-red-500 rounded-full transition-colors"
              title="End call"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="w-full sm:w-1/3 lg:w-1/4 min-w-[280px] bg-[#12121a] border-l border-white/5 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="font-semibold text-white">Chat</h3>
              <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white p-1 sm:hidden">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">In call ({users.length})</p>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 text-xs"
                    style={{ borderLeft: `3px solid ${user.color}` }}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-gray-300">{user.name}</span>
                    {userInfo && user.id === userInfo.id && <span className="text-gray-500">(you)</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8">
                  No messages yet. Start chatting!
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${userInfo && msg.userId === userInfo.id ? "ml-4" : "mr-4"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: msg.userColor }}>
                        {msg.userName}
                      </span>
                      <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm ${
                        userInfo && msg.userId === userInfo.id
                          ? "bg-violet-600 text-white rounded-br-md"
                          : "bg-white/5 text-gray-300 rounded-bl-md"
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={!chatMessage.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes float-up {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(1.5);
            opacity: 0;
          }
        }
        .animate-float-up {
          animation: float-up 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
