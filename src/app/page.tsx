"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [shareType, setShareType] = useState<"code" | "file" | "call" | null>(null);

  const createNewRoom = (type: "code" | "file", callType?: "audio" | "video") => {
    setIsCreating(true);
    const newRoomId = nanoid(10);
    if (callType) {
      router.push(`/${newRoomId}?type=${type}&call=${callType}`);
    } else {
      router.push(`/${newRoomId}?type=${type}`);
    }
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-64 sm:w-96 h-64 sm:h-96 bg-violet-600/20 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 -right-32 w-64 sm:w-96 h-64 sm:h-96 bg-cyan-500/20 rounded-full blur-[128px]" />

      <div className="w-full max-w-xl relative z-10">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 sm:mb-3 tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Sharex
            </span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg font-light">
            Share code, files & calls in real-time
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-[#12121a]/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-white/5 shadow-2xl">

          {!shareType ? (
            <>
              {/* Share Type Selection */}
              <p className="text-center text-gray-400 mb-4 sm:mb-6 text-xs sm:text-sm font-medium uppercase tracking-wider">
                What would you like to do?
              </p>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
                <button
                  onClick={() => setShareType("code")}
                  className="group relative p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base mb-0.5">Code</h3>
                  <p className="text-gray-500 text-xs hidden sm:block">Real-time editor</p>
                </button>

                <button
                  onClick={() => setShareType("file")}
                  className="group relative p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base mb-0.5">File</h3>
                  <p className="text-gray-500 text-xs hidden sm:block">Up to 4MB</p>
                </button>

                <button
                  onClick={() => setShareType("call")}
                  className="group relative p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base mb-0.5">Call</h3>
                  <p className="text-gray-500 text-xs hidden sm:block">Video & Audio</p>
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 bg-[#12121a] text-gray-600 text-sm">
                    or join existing
                  </span>
                </div>
              </div>

              {/* Join Room Form */}
              <form onSubmit={joinRoom} className="space-y-3 sm:space-y-4">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID..."
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all font-light text-sm sm:text-base"
                />
                <button
                  type="submit"
                  disabled={!roomId.trim()}
                  className="w-full py-3 sm:py-4 px-4 sm:px-6 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.02] disabled:text-gray-600 text-white font-medium rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 border border-white/10 disabled:border-white/5 text-sm sm:text-base"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Join Room
                </button>
              </form>
            </>
          ) : shareType === "call" ? (
            <>
              {/* Back Button */}
              <button
                onClick={() => setShareType(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {/* Call Type Selection */}
              <div className="text-center mb-6">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">Start a Call</h2>
                <p className="text-gray-400 text-sm">Choose your call type</p>
              </div>

              {/* Call Type Buttons */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => createNewRoom("code", "video")}
                  disabled={isCreating}
                  className="group p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-base sm:text-lg mb-1">Video Call</h3>
                  <p className="text-gray-500 text-xs sm:text-sm">Face-to-face</p>
                </button>

                <button
                  onClick={() => createNewRoom("code", "audio")}
                  disabled={isCreating}
                  className="group p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-base sm:text-lg mb-1">Audio Call</h3>
                  <p className="text-gray-500 text-xs sm:text-sm">Voice only</p>
                </button>
              </div>

              {isCreating && (
                <div className="mt-4 flex items-center justify-center gap-2 text-gray-400">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating room...
                </div>
              )}
            </>
          ) : (
            <>
              {/* Back Button */}
              <button
                onClick={() => setShareType(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {/* Selected Type Header */}
              <div className="text-center mb-8">
                <div className={`w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                  shareType === "code" ? "bg-violet-500/20" : "bg-cyan-500/20"
                }`}>
                  {shareType === "code" ? (
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
                  {shareType === "code" ? "Share Code" : "Share File"}
                </h2>
                <p className="text-gray-400 text-sm">
                  {shareType === "code"
                    ? "Real-time collaborative code editor"
                    : "Share files up to 4MB (auto-deletes in 10 min)"}
                </p>
              </div>

              {/* Create Room Button */}
              <button
                onClick={() => createNewRoom(shareType)}
                disabled={isCreating}
                className={`w-full py-3 sm:py-4 px-6 font-semibold rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
                  shareType === "code"
                    ? "bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shadow-violet-500/25"
                    : "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white shadow-cyan-500/25"
                }`}
              >
                {isCreating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Room
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Features */}
        <div className="mt-6 sm:mt-10 flex flex-wrap justify-center gap-4 sm:gap-8 text-center">
          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500 text-xs sm:text-sm">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Real-time sync
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500 text-xs sm:text-sm">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            No sign up
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500 text-xs sm:text-sm">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Auto cleanup
          </div>
        </div>
      </div>
    </div>
  );
}
