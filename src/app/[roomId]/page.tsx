"use client";

import { use, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/user-context";
import ConnectionStatus from "@/components/ConnectionStatus";
import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => <TabLoadingSpinner />,
});

const FileShare = dynamic(() => import("@/components/FileShare"), {
  ssr: false,
  loading: () => <TabLoadingSpinner />,
});

const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
  loading: () => <TabLoadingSpinner />,
});

const UsernameModal = dynamic(() => import("@/components/UsernameModal"), {
  ssr: false,
});

function TabLoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

type TabType = "code" | "file" | "call";

const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  {
    key: "code",
    label: "Code",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    key: "file",
    label: "File",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "call",
    label: "Call",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
];

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasUsername } = useUser();

  // Support both ?tab= (new) and ?type= (legacy) params
  const initialTab = useMemo(() => {
    const tab = searchParams.get("tab") || searchParams.get("type");
    return tab === "code" || tab === "file" || tab === "call" ? tab : "code";
  }, [searchParams]);

  const initialCallType = useMemo(() => {
    const call = searchParams.get("call");
    return call === "audio" || call === "video" ? call : "video";
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [usernameReady, setUsernameReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    const url = tab === "call"
      ? `/${resolvedParams.roomId}?tab=${tab}&call=${initialCallType}`
      : `/${resolvedParams.roomId}?tab=${tab}`;
    window.history.replaceState({}, "", url);
  }, [resolvedParams.roomId, initialCallType]);

  const handleEndCall = useCallback(() => {
    switchTab("code");
  }, [switchTab]);

  const copyShareLink = async () => {
    const url = `${window.location.origin}/${resolvedParams.roomId}`;
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

  // Username gating - show modal before entering room
  const showUsernameModal = !hasUsername && !usernameReady;
  if (showUsernameModal) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <UsernameModal onComplete={() => setUsernameReady(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f]">
      {/* Shared Header */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-[#12121a] border-b border-white/5">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Home button */}
          <button
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Back to Home"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          {/* Logo (non-clickable) */}
          <span className="text-lg sm:text-xl font-bold">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              CodeNest
            </span>
          </span>

          <ConnectionStatus />

          {/* Tab bar */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 ml-1 sm:ml-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share */}
          <button
            onClick={copyShareLink}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-white text-xs sm:text-sm font-medium rounded-lg transition-all ${
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
        </div>
      </header>

      {/* Tab Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Code tab - always mounted, hidden via CSS */}
        <div className={`absolute inset-0 ${activeTab === "code" ? "" : "hidden"}`}>
          <CodeEditor roomId={resolvedParams.roomId} embedded />
        </div>

        {/* File tab - always mounted, hidden via CSS */}
        <div className={`absolute inset-0 ${activeTab === "file" ? "" : "hidden"}`}>
          <FileShare roomId={resolvedParams.roomId} embedded />
        </div>

        {/* Call tab - conditionally rendered (camera/mic permissions) */}
        {activeTab === "call" && (
          <div className="absolute inset-0">
            <CallRoom
              roomId={resolvedParams.roomId}
              callType={initialCallType}
              embedded
              onEndCall={handleEndCall}
            />
          </div>
        )}
      </div>
    </div>
  );
}
