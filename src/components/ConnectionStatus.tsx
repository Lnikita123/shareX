"use client";

import { useEffect, useState } from "react";
import { getConnectionState, onConnectionStateChange, reconnectSocket } from "@/lib/socket";

export default function ConnectionStatus() {
  const [state, setState] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");

  useEffect(() => {
    setState(getConnectionState());
    const unsub = onConnectionStateChange(setState);
    return unsub;
  }, []);

  if (state === "connected") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="hidden sm:inline">Connected</span>
      </div>
    );
  }

  if (state === "connecting") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-400">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        <span className="hidden sm:inline">Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-red-400">
      <span className="w-2 h-2 rounded-full bg-red-500" />
      <span className="hidden sm:inline">Disconnected</span>
      <button
        onClick={reconnectSocket}
        className="ml-1 px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
