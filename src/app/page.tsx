"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [shareType, setShareType] = useState<"code" | "file" | null>(null);

  const createNewRoom = (type: "code" | "file") => {
    setIsCreating(true);
    const newRoomId = nanoid(10);
    router.push(`/${newRoomId}?type=${type}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" />

      <div className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold mb-3 tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Sharex
            </span>
          </h1>
          <p className="text-gray-400 text-lg font-light">
            Share code & files in real-time
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-[#12121a]/80 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl">

          {!shareType ? (
            <>
              {/* Share Type Selection */}
              <p className="text-center text-gray-400 mb-6 text-sm font-medium uppercase tracking-wider">
                What would you like to share?
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => setShareType("code")}
                  className="group relative p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                    <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-1">Code</h3>
                  <p className="text-gray-500 text-sm">Real-time editor</p>
                </button>

                <button
                  onClick={() => setShareType("file")}
                  className="group relative p-6 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
                    <svg className="w-7 h-7 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-1">File</h3>
                  <p className="text-gray-500 text-sm">Up to 4MB</p>
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
              <form onSubmit={joinRoom} className="space-y-4">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID..."
                  className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all font-light"
                />
                <button
                  type="submit"
                  disabled={!roomId.trim()}
                  className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.02] disabled:text-gray-600 text-white font-medium rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 border border-white/10 disabled:border-white/5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Join Room
                </button>
              </form>
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
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                  shareType === "code" ? "bg-violet-500/20" : "bg-cyan-500/20"
                }`}>
                  {shareType === "code" ? (
                    <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">
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
                className={`w-full py-4 px-6 font-semibold rounded-2xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
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
        <div className="mt-10 flex justify-center gap-8 text-center">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Real-time sync
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            No sign up
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Auto cleanup
          </div>
        </div>
      </div>
    </div>
  );
}
