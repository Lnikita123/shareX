"use client";

import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  message: string;
  timestamp: number;
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

interface ChatSidebarProps {
  messages: ChatMessage[];
  users: UserInfo[];
  currentUserId: string;
  onSendMessage: (message: string) => void;
  onClose: () => void;
}

export default function ChatSidebar({ messages, users, currentUserId, onSendMessage, onClose }: ChatSidebarProps) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-80 h-full bg-[#12121a] border-l border-white/5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="font-semibold text-white">Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Online Users */}
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Online ({users.length})</p>
        <div className="flex flex-wrap gap-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 text-xs"
              style={{ borderLeft: `3px solid ${user.color}` }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-gray-300">{user.name}</span>
              {user.id === currentUserId && <span className="text-gray-500">(you)</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${msg.userId === currentUserId ? "ml-4" : "mr-4"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium" style={{ color: msg.userColor }}>
                  {msg.userName}
                </span>
                <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
              </div>
              <div
                className={`px-3 py-2 rounded-2xl text-sm ${
                  msg.userId === currentUserId
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
