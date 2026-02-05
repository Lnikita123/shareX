"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import dynamic from "next/dynamic";

const VideoCall = dynamic(() => import("./VideoCall"), { ssr: false });

interface FileShareProps {
  roomId: string;
}

interface FileData {
  name: string;
  size: number;
  type: string;
  data: string;
  uploadedAt: number;
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
};

export default function FileShare({ roomId }: FileShareProps) {
  const [file, setFile] = useState<FileData | null>(null);
  const [userCount, setUserCount] = useState<number>(1);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showVideoCall, setShowVideoCall] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<{ fromId: string; fromName: string; type: "audio" | "video" } | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join-file-room", roomId);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("file-room-data", (data: { file: FileData | null; userCount: number; userInfo: UserInfo }) => {
      setFile(data.file);
      setUserCount(data.userCount);
      setUserInfo(data.userInfo);
    });

    socket.on("file-update", (data: { file: FileData }) => {
      setFile(data.file);
    });

    socket.on("file-removed", () => {
      setFile(null);
    });

    socket.on("user-joined", (data: { userCount: number }) => {
      setUserCount(data.userCount);
    });

    socket.on("user-left", (data: { userCount: number; users: UserInfo[] }) => {
      setUserCount(data.userCount);
      if (data.users) {
        setUsers(data.users);
      }
    });

    socket.on("users-update", (data: { users: UserInfo[] }) => {
      setUsers(data.users);
    });

    // Handle incoming call
    socket.on("incoming-call", (data: { fromId: string; fromName: string; type: "audio" | "video" }) => {
      setIncomingCall(data);
      setShowVideoCall(true);

      // Play ringtone
      if (ringtoneRef.current) {
        ringtoneRef.current.play().catch(err => console.log("Ringtone play failed:", err));
      }

      // Request browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Incoming ${data.type} call from ${data.fromName}`, {
          body: `${data.fromName} is calling you...`,
          icon: '/favicon.ico',
          tag: 'incoming-call',
        });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(`Incoming ${data.type} call from ${data.fromName}`, {
              body: `${data.fromName} is calling you...`,
              icon: '/favicon.ico',
              tag: 'incoming-call',
            });
          }
        });
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("file-room-data");
      socket.off("file-update");
      socket.off("file-removed");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("users-update");
      socket.off("incoming-call");
    };
  }, [roomId]);

  // Set up ringtone for incoming calls
  useEffect(() => {
    const audio = new Audio();
    audio.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjSG0fPTgjMGHm7A7+OZUQ0MW";
    audio.loop = true;
    audio.volume = 0.5;
    ringtoneRef.current = audio;

    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    };
  }, []);

  // Stop ringtone when video call is closed
  useEffect(() => {
    if (!showVideoCall && ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [showVideoCall]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${formatSize(MAX_FILE_SIZE)}`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      reader.onload = () => {
        const fileData: FileData = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type || "application/octet-stream",
          data: reader.result as string,
          uploadedAt: Date.now(),
        };

        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("file-upload", { roomId, file: fileData });
        }
        setFile(fileData);
        setIsUploading(false);
      };
      reader.onerror = () => {
        setError("Failed to read file");
        setIsUploading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch {
      setError("Failed to upload file");
      setIsUploading(false);
    }
  }, [roomId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const downloadFile = () => {
    if (!file) return;
    const link = document.createElement("a");
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeFile = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("file-remove", { roomId });
    }
    setFile(null);
  };

  const copyShareLink = async () => {
    const url = window.location.href;
    try {
      // Try using clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback: Create a temporary textarea
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // If copy fails, show the URL in an alert
      alert(`Copy this link: ${url}`);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) {
      return (
        <svg className="w-12 h-12 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    if (type.startsWith("video/")) {
      return (
        <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    }
    if (type.startsWith("audio/")) {
      return (
        <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    }
    if (type === "application/pdf") {
      return (
        <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }
    if (type.includes("zip") || type.includes("rar") || type.includes("tar")) {
      return (
        <svg className="w-12 h-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    }
    return (
      <svg className="w-12 h-12 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-[#12121a] border-b border-white/5">
        <div className="flex items-center gap-2 sm:gap-4">
          <h1 className="text-lg sm:text-xl font-bold">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Sharex
            </span>
          </h1>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-400">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="hidden sm:inline">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Users */}
          <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-white/5 rounded-lg border border-white/10">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            <span className="text-xs sm:text-sm text-gray-300">{userCount}</span>
          </div>

          {/* Video Call */}
          <button
            onClick={() => setShowVideoCall(true)}
            className="p-1.5 sm:p-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
            title="Video Call"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Share */}
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-1.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-medium rounded-lg transition-all shadow-lg shadow-cyan-500/25"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden xs:inline">{copied ? "Copied!" : "Share"}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          {!file ? (
            /* Upload Area */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl sm:rounded-3xl p-6 sm:p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragging
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-white/10 hover:border-cyan-500/50 hover:bg-white/[0.02]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />

              {isUploading ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400">Uploading... {uploadProgress}%</p>
                  <div className="w-48 mx-auto h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                    <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {isDragging ? "Drop your file here" : "Drag & drop a file"}
                  </h3>
                  <p className="text-gray-500 mb-4">or click to browse</p>
                  <p className="text-gray-600 text-sm">Maximum file size: {formatSize(MAX_FILE_SIZE)}</p>
                </>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          ) : (
            /* File Preview */
            <div className="bg-[#12121a] rounded-3xl p-8 border border-white/5">
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-white truncate mb-1">{file.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    {formatSize(file.size)} • {file.type || "Unknown type"}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={downloadFile}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-cyan-500/25"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <button
                      onClick={removeFile}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 text-sm font-medium rounded-xl transition-all border border-white/10 hover:border-red-500/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Image Preview */}
              {file.type.startsWith("image/") && (
                <div className="mt-6 rounded-2xl overflow-hidden bg-black/20">
                  <img src={file.data} alt={file.name} className="w-full max-h-96 object-contain" />
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="mt-8 flex justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure transfer
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Real-time sync
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-violet-600/90 to-cyan-600/90 text-white text-sm">
        <div className="flex items-center gap-4">
          <span className="opacity-80">Room: {roomId}</span>
          <span className="opacity-80">Type: File Share</span>
        </div>
        <div className="opacity-80">
          {file ? `${file.name} (${formatSize(file.size)})` : "No file uploaded"}
        </div>
      </footer>

      {/* Video Call Modal */}
      {showVideoCall && socketRef.current && userInfo && (
        <VideoCall
          socket={socketRef.current}
          roomId={roomId}
          currentUserId={userInfo.id}
          users={users}
          onClose={() => {
            setShowVideoCall(false);
            setIncomingCall(null);
            if (ringtoneRef.current) {
              ringtoneRef.current.pause();
              ringtoneRef.current.currentTime = 0;
            }
          }}
          initialIncomingCall={incomingCall}
          onCallHandled={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
