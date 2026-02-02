"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import type * as Monaco from "monaco-editor";
import ChatSidebar from "./ChatSidebar";
import dynamic from "next/dynamic";

const VideoCall = dynamic(() => import("./VideoCall"), { ssr: false });

interface CodeEditorProps {
  roomId: string;
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
  cursor?: { lineNumber: number; column: number };
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  message: string;
  timestamp: number;
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript", ext: "js", judgeId: 63 },
  { value: "typescript", label: "TypeScript", ext: "ts", judgeId: 74 },
  { value: "python", label: "Python", ext: "py", judgeId: 71 },
  { value: "java", label: "Java", ext: "java", judgeId: 62 },
  { value: "cpp", label: "C++", ext: "cpp", judgeId: 54 },
  { value: "c", label: "C", ext: "c", judgeId: 50 },
  { value: "csharp", label: "C#", ext: "cs", judgeId: 51 },
  { value: "go", label: "Go", ext: "go", judgeId: 60 },
  { value: "rust", label: "Rust", ext: "rs", judgeId: 73 },
  { value: "ruby", label: "Ruby", ext: "rb", judgeId: 72 },
  { value: "php", label: "PHP", ext: "php", judgeId: 68 },
  { value: "swift", label: "Swift", ext: "swift", judgeId: 83 },
  { value: "kotlin", label: "Kotlin", ext: "kt", judgeId: 78 },
  { value: "html", label: "HTML", ext: "html", judgeId: null },
  { value: "css", label: "CSS", ext: "css", judgeId: null },
  { value: "json", label: "JSON", ext: "json", judgeId: null },
  { value: "sql", label: "SQL", ext: "sql", judgeId: null },
  { value: "shell", label: "Shell", ext: "sh", judgeId: 46 },
  { value: "plaintext", label: "Plain Text", ext: "txt", judgeId: null },
];

const THEMES = [
  { value: "vs-dark", label: "Dark", bg: "#1e1e1e" },
  { value: "dracula", label: "Dracula", bg: "#282a36" },
  { value: "one-dark", label: "One Dark", bg: "#282c34" },
  { value: "github-dark", label: "GitHub Dark", bg: "#0d1117" },
];

// Define custom themes
const defineThemes = (monaco: typeof Monaco) => {
  monaco.editor.defineTheme("dracula", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6272a4", fontStyle: "italic" },
      { token: "keyword", foreground: "ff79c6" },
      { token: "string", foreground: "f1fa8c" },
      { token: "number", foreground: "bd93f9" },
      { token: "type", foreground: "8be9fd" },
      { token: "function", foreground: "50fa7b" },
      { token: "variable", foreground: "f8f8f2" },
    ],
    colors: {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "editor.lineHighlightBackground": "#44475a",
      "editor.selectionBackground": "#44475a",
      "editorCursor.foreground": "#f8f8f2",
      "editorWhitespace.foreground": "#3B3A32",
    },
  });

  monaco.editor.defineTheme("one-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "keyword", foreground: "c678dd" },
      { token: "string", foreground: "98c379" },
      { token: "number", foreground: "d19a66" },
      { token: "type", foreground: "e5c07b" },
      { token: "function", foreground: "61afef" },
      { token: "variable", foreground: "e06c75" },
    ],
    colors: {
      "editor.background": "#282c34",
      "editor.foreground": "#abb2bf",
      "editor.lineHighlightBackground": "#2c313c",
      "editor.selectionBackground": "#3e4451",
      "editorCursor.foreground": "#528bff",
    },
  });

  monaco.editor.defineTheme("github-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8b949e", fontStyle: "italic" },
      { token: "keyword", foreground: "ff7b72" },
      { token: "string", foreground: "a5d6ff" },
      { token: "number", foreground: "79c0ff" },
      { token: "type", foreground: "ffa657" },
      { token: "function", foreground: "d2a8ff" },
      { token: "variable", foreground: "ffa657" },
    ],
    colors: {
      "editor.background": "#0d1117",
      "editor.foreground": "#c9d1d9",
      "editor.lineHighlightBackground": "#161b22",
      "editor.selectionBackground": "#264f78",
      "editorCursor.foreground": "#c9d1d9",
    },
  });
};

export default function CodeEditor({ roomId }: CodeEditorProps) {
  const [code, setCode] = useState<string>("// Start coding here...\n");
  const [language, setLanguage] = useState<string>("javascript");
  const [theme, setTheme] = useState<string>("vs-dark");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [showVideoCall, setShowVideoCall] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<{ fromId: string; fromName: string; type: "audio" | "video" } | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [output, setOutput] = useState<string>("");
  const [showOutput, setShowOutput] = useState<boolean>(false);
  const [showGistModal, setShowGistModal] = useState<boolean>(false);
  const [gistUrl, setGistUrl] = useState<string>("");
  const [gistLoading, setGistLoading] = useState<boolean>(false);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const isRemoteUpdate = useRef<boolean>(false);
  const decorationsRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join-room", roomId);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("room-data", (data: {
      code: string;
      language: string;
      theme: string;
      users: UserInfo[];
      messages: ChatMessage[];
      userInfo: UserInfo;
    }) => {
      isRemoteUpdate.current = true;
      setCode(data.code);
      setLanguage(data.language);
      setTheme(data.theme || "vs-dark");
      setUsers(data.users);
      setMessages(data.messages);
      setUserInfo(data.userInfo);
      setTimeout(() => {
        isRemoteUpdate.current = false;
      }, 0);
    });

    socket.on("code-update", (data: { code: string }) => {
      isRemoteUpdate.current = true;
      setCode(data.code);
      setTimeout(() => {
        isRemoteUpdate.current = false;
      }, 0);
    });

    socket.on("language-update", (data: { language: string }) => {
      setLanguage(data.language);
    });

    socket.on("theme-update", (data: { theme: string }) => {
      setTheme(data.theme);
    });

    socket.on("user-joined", (data: { user: UserInfo; users: UserInfo[] }) => {
      setUsers(data.users);
    });

    socket.on("user-left", (data: { oderId: string; users: UserInfo[] }) => {
      setUsers(data.users);
      // Remove cursor decoration
      if (editorRef.current && decorationsRef.current.has(data.oderId)) {
        editorRef.current.deltaDecorations(decorationsRef.current.get(data.oderId)!, []);
        decorationsRef.current.delete(data.oderId);
      }
    });

    socket.on("users-update", (data: { users: UserInfo[] }) => {
      setUsers(data.users);
    });

    socket.on("cursor-update", (data: { userId: string; cursor: { lineNumber: number; column: number }; userName: string; userColor: string }) => {
      updateRemoteCursor(data.userId, data.cursor, data.userName, data.userColor);
    });

    socket.on("selection-update", (data: { userId: string; selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null; userName: string; userColor: string }) => {
      updateRemoteSelection(data.userId, data.selection, data.userName, data.userColor);
    });

    socket.on("new-message", (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      if (!showChat) {
        setUnreadMessages((prev) => prev + 1);
      }
    });

    // Handle incoming call - this needs to be in parent component
    // so users can receive calls even when VideoCall modal is closed
    socket.on("incoming-call", (data: { fromId: string; fromName: string; type: "audio" | "video" }) => {
      setIncomingCall(data);
      setShowVideoCall(true); // Auto-open video call modal

      // Play ringtone
      if (ringtoneRef.current) {
        ringtoneRef.current.play().catch(err => console.log("Ringtone play failed:", err));
      }

      // Request browser notification permission and show notification
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
      socket.off("room-data");
      socket.off("code-update");
      socket.off("language-update");
      socket.off("theme-update");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("users-update");
      socket.off("cursor-update");
      socket.off("selection-update");
      socket.off("new-message");
      socket.off("incoming-call");
    };
  }, [roomId, showChat]);

  // Set up ringtone for incoming calls
  useEffect(() => {
    // Create a simple ringtone using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 440; // A4 note
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    // Store reference for cleanup
    const playRingtone = () => {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      oscillator.start();
      setTimeout(() => oscillator.stop(), 2000); // Ring for 2 seconds
    };

    // Create an Audio element for ringtone (alternative approach using data URL)
    const audio = new Audio();
    // Using a simple beep data URL
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

  // Stop ringtone when video call is closed or answered
  useEffect(() => {
    if (!showVideoCall && ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [showVideoCall]);

  const updateRemoteCursor = (userId: string, cursor: { lineNumber: number; column: number }, userName: string, userColor: string) => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Remove old decoration
    if (decorationsRef.current.has(userId)) {
      editor.deltaDecorations(decorationsRef.current.get(userId)!, []);
    }

    // Add new cursor decoration
    const newDecorations = editor.deltaDecorations([], [
      {
        range: new monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column + 1),
        options: {
          className: `remote-cursor-${userId}`,
          beforeContentClassName: `remote-cursor-line`,
          after: {
            content: ` ${userName}`,
            inlineClassName: "remote-cursor-label",
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    decorationsRef.current.set(userId, newDecorations);

    // Add dynamic CSS for cursor color
    const styleId = `cursor-style-${userId}`;
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .remote-cursor-${userId} {
        background-color: ${userColor};
        width: 2px !important;
      }
      .remote-cursor-label {
        background-color: ${userColor};
        color: white;
        padding: 0 4px;
        border-radius: 2px;
        font-size: 10px;
        margin-left: 4px;
      }
    `;
  };

  const updateRemoteSelection = (userId: string, selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null, _userName: string, userColor: string) => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const selectionKey = `selection-${userId}`;

    // Remove old selection decoration
    if (decorationsRef.current.has(selectionKey)) {
      editor.deltaDecorations(decorationsRef.current.get(selectionKey)!, []);
    }

    if (!selection) return;

    // Add new selection decoration
    const newDecorations = editor.deltaDecorations([], [
      {
        range: new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn
        ),
        options: {
          className: `remote-selection-${userId}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    decorationsRef.current.set(selectionKey, newDecorations);

    // Add dynamic CSS for selection color
    const styleId = `selection-style-${userId}`;
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .remote-selection-${userId} {
        background-color: ${userColor}40;
      }
    `;
  };

  const handleEditorChange: OnChange = useCallback(
    (value) => {
      if (isRemoteUpdate.current) return;

      const newCode = value || "";
      setCode(newCode);

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("code-change", { roomId, code: newCode });
      }
    },
    [roomId]
  );

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("language-change", { roomId, language: newLanguage });
    }
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = e.target.value;
    setTheme(newTheme);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("theme-change", { roomId, theme: newTheme });
    }
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom themes
    defineThemes(monaco);

    editor.focus();

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("cursor-move", {
          roomId,
          cursor: { lineNumber: e.position.lineNumber, column: e.position.column },
        });
      }
    });

    // Track selection
    editor.onDidChangeCursorSelection((e) => {
      if (socketRef.current && socketRef.current.connected) {
        const selection = e.selection;
        if (selection.isEmpty()) {
          socketRef.current.emit("selection-change", { roomId, selection: null });
        } else {
          socketRef.current.emit("selection-change", {
            roomId,
            selection: {
              startLineNumber: selection.startLineNumber,
              startColumn: selection.startColumn,
              endLineNumber: selection.endLineNumber,
              endColumn: selection.endColumn,
            },
          });
        }
      }
    });
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

  const exportCode = () => {
    const lang = LANGUAGES.find((l) => l.value === language);
    const ext = lang?.ext || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code-${roomId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runCode = async () => {
    const lang = LANGUAGES.find((l) => l.value === language);
    if (!lang?.judgeId) {
      setOutput("Code execution is not supported for this language.");
      setShowOutput(true);
      return;
    }

    setIsRunning(true);
    setOutput("Running...");
    setShowOutput(true);

    try {
      // Using Judge0 API (free tier)
      const response = await fetch("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY", // User needs to add their key
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
        },
        body: JSON.stringify({
          language_id: lang.judgeId,
          source_code: btoa(code),
          stdin: "",
        }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const result = await response.json();

      if (result.stdout) {
        setOutput(atob(result.stdout));
      } else if (result.stderr) {
        setOutput(`Error:\n${atob(result.stderr)}`);
      } else if (result.compile_output) {
        setOutput(`Compile Error:\n${atob(result.compile_output)}`);
      } else if (result.message) {
        setOutput(result.message);
      } else {
        setOutput("No output");
      }
    } catch {
      setOutput("Code execution requires a Judge0 API key.\n\nTo enable:\n1. Get a free API key from rapidapi.com/judge0-official/api/judge0-ce\n2. Replace 'YOUR_RAPIDAPI_KEY' in CodeEditor.tsx\n\nAlternatively, the code ran but couldn't connect to the execution server.");
    } finally {
      setIsRunning(false);
    }
  };

  const importFromGist = async () => {
    if (!gistUrl.trim()) return;

    setGistLoading(true);
    try {
      // Extract gist ID from URL
      const gistId = gistUrl.split("/").pop()?.split("?")[0];
      if (!gistId) throw new Error("Invalid Gist URL");

      const response = await fetch(`https://api.github.com/gists/${gistId}`);
      if (!response.ok) throw new Error("Gist not found");

      const data = await response.json();
      const files = Object.values(data.files) as { content: string; language: string; filename: string }[];

      if (files.length > 0) {
        const file = files[0];
        setCode(file.content);

        // Try to detect language from file extension
        const ext = file.filename.split(".").pop()?.toLowerCase();
        const detectedLang = LANGUAGES.find((l) => l.ext === ext);
        if (detectedLang) {
          setLanguage(detectedLang.value);
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit("language-change", { roomId, language: detectedLang.value });
          }
        }

        // Sync code to other users
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("code-change", { roomId, code: file.content });
        }
      }

      setShowGistModal(false);
      setGistUrl("");
    } catch {
      alert("Failed to import Gist. Please check the URL and try again.");
    } finally {
      setGistLoading(false);
    }
  };

  const handleSendMessage = (message: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("chat-message", { roomId, message });
    }
  };

  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setUnreadMessages(0);
    }
  };

  const lineCount = code.split("\n").length;
  const currentTheme = THEMES.find((t) => t.value === theme);

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <div className="flex flex-col flex-1">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-[#12121a] border-b border-white/5">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Sharex
              </span>
            </h1>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
              {isConnected ? "Connected" : "Disconnected"}
            </div>
            {/* User avatars */}
            <div className="flex -space-x-2">
              {users.slice(0, 5).map((user) => (
                <div
                  key={user.id}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-[#12121a]"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name[0]}
                </div>
              ))}
              {users.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white border-2 border-[#12121a]">
                  +{users.length - 5}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language */}
            <select
              value={language}
              onChange={handleLanguageChange}
              className="px-3 py-1.5 bg-white/5 text-gray-300 text-sm rounded-lg border border-white/10 focus:outline-none focus:border-violet-500/50 cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value} className="bg-[#1a1a24]">
                  {lang.label}
                </option>
              ))}
            </select>

            {/* Theme */}
            <select
              value={theme}
              onChange={handleThemeChange}
              className="px-3 py-1.5 bg-white/5 text-gray-300 text-sm rounded-lg border border-white/10 focus:outline-none focus:border-violet-500/50 cursor-pointer"
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#1a1a24]">
                  {t.label}
                </option>
              ))}
            </select>

            {/* Import Gist */}
            <button
              onClick={() => setShowGistModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg border border-white/10 transition-colors"
              title="Import from GitHub Gist"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Gist
            </button>

            {/* Run Code */}
            <button
              onClick={runCode}
              disabled={isRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white text-sm rounded-lg transition-colors"
            >
              {isRunning ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              Run
            </button>

            {/* Export */}
            <button
              onClick={exportCode}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg border border-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>

            {/* Video Call */}
            <button
              onClick={() => setShowVideoCall(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg border border-white/10 transition-colors"
              title="Start Video Call"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Chat Toggle */}
            <button
              onClick={toggleChat}
              className="relative flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg border border-white/10 transition-colors"
              title="Open Chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            {/* Share */}
            <button
              onClick={copyShareLink}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-violet-500/25"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? "Copied!" : "Share"}
            </button>
          </div>
        </header>

        {/* Editor */}
        <div className="flex-1 relative">
          <Editor
            height="100%"
            language={language}
            theme={theme}
            value={code}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: true },
              lineNumbers: "on",
              roundedSelection: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 16 },
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              smoothScrolling: true,
              renderLineHighlight: "all",
              bracketPairColorization: { enabled: true },
            }}
          />

          {/* Output Panel */}
          {showOutput && (
            <div className="absolute bottom-0 left-0 right-0 h-48 bg-[#12121a] border-t border-white/10">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                <span className="text-sm font-medium text-gray-300">Output</span>
                <button onClick={() => setShowOutput(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <pre className="p-4 text-sm text-gray-300 font-mono overflow-auto h-[calc(100%-40px)] whitespace-pre-wrap">
                {output}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-violet-600/90 to-cyan-600/90 text-white text-sm">
          <div className="flex items-center gap-4">
            <span className="opacity-80">Room: {roomId}</span>
            <span className="opacity-80">Lines: {lineCount}</span>
            <span className="opacity-80">Users: {users.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-80">{LANGUAGES.find((l) => l.value === language)?.label}</span>
            <span className="opacity-60">•</span>
            <span className="opacity-80">{currentTheme?.label}</span>
          </div>
        </footer>
      </div>

      {/* Chat Sidebar */}
      {showChat && userInfo && (
        <ChatSidebar
          messages={messages}
          users={users}
          currentUserId={userInfo.id}
          onSendMessage={handleSendMessage}
          onClose={() => setShowChat(false)}
        />
      )}

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

      {/* Gist Import Modal */}
      {showGistModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] rounded-2xl border border-white/10 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Import from GitHub Gist</h3>
            <input
              type="text"
              value={gistUrl}
              onChange={(e) => setGistUrl(e.target.value)}
              placeholder="https://gist.github.com/username/gist_id"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowGistModal(false)}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={importFromGist}
                disabled={gistLoading || !gistUrl.trim()}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {gistLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Import"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
