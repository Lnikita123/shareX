"use client";

import { use, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

const FileShare = dynamic(() => import("@/components/FileShare"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();

  // Compute initial values from URL params
  const initialType = useMemo(() => {
    const type = searchParams.get("type");
    return type === "code" || type === "file" || type === "call" ? type : null;
  }, [searchParams]);

  const initialCallType = useMemo(() => {
    const call = searchParams.get("call");
    return call === "audio" || call === "video" ? call : null;
  }, [searchParams]);

  const [roomType, setRoomType] = useState<"code" | "file" | "call" | null>(initialType);
  const [isSelecting, setIsSelecting] = useState(initialType === null);

  const selectType = (type: "code" | "file" | "call", callType?: "audio" | "video") => {
    setRoomType(type);
    setIsSelecting(false);
    // Update URL without reload
    if (type === "call" && callType) {
      window.history.replaceState({}, "", `/${resolvedParams.roomId}?type=call&call=${callType}`);
    } else {
      window.history.replaceState({}, "", `/${resolvedParams.roomId}?type=${type}`);
    }
  };

  if (isSelecting) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" />

        <div className="w-full max-w-lg relative z-10">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold mb-3">
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                Sharex
              </span>
            </h1>
            <p className="text-gray-400">
              Room: <span className="font-mono text-gray-300">{resolvedParams.roomId}</span>
            </p>
          </div>

          <div className="bg-[#12121a]/80 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl">
            <p className="text-center text-gray-400 mb-6 text-sm font-medium uppercase tracking-wider">
              What would you like to share?
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => selectType("code")}
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
                onClick={() => selectType("file")}
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
          </div>
        </div>
      </div>
    );
  }

  if (!roomType) {
    return <LoadingScreen />;
  }

  if (roomType === "call") {
    return <CallRoom roomId={resolvedParams.roomId} callType={initialCallType || "video"} />;
  }

  return roomType === "code" ? (
    <CodeEditor roomId={resolvedParams.roomId} autoCall={initialCallType} />
  ) : (
    <FileShare roomId={resolvedParams.roomId} />
  );
}
