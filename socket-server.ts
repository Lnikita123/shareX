import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const port = parseInt(process.env.PORT || "3001", 10);

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_CODE_SIZE = 500 * 1024; // 500KB
const MAX_ROOM_SIZE = 50; // Max users per room

// Simple per-socket rate limiter
const rateLimiters = new Map<string, Map<string, { count: number; resetAt: number }>>();

const RATE_LIMITS: Record<string, number> = {
  "code-change": 10,
  "chat-message": 5,
  "cursor-move": 20,
};

function checkRateLimit(socketId: string, event: string): boolean {
  const limit = RATE_LIMITS[event];
  if (!limit) return true;

  if (!rateLimiters.has(socketId)) {
    rateLimiters.set(socketId, new Map());
  }
  const socketLimits = rateLimiters.get(socketId)!;

  const now = Date.now();
  const entry = socketLimits.get(event);

  if (!entry || now >= entry.resetAt) {
    socketLimits.set(event, { count: 1, resetAt: now + 1000 });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// Generate random color for user
const generateUserColor = () => {
  const colors = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#4ade80",
    "#2dd4bf", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Generate random username
const generateUsername = () => {
  const adjectives = ["Swift", "Clever", "Brave", "Calm", "Bold", "Quick", "Sharp", "Keen"];
  const nouns = ["Coder", "Dev", "Hacker", "Ninja", "Wizard", "Guru", "Master", "Pro"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
};

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

interface CodeRoomData {
  type: "code";
  code: string;
  language: string;
  theme: string;
  users: Map<string, UserInfo>;
  messages: ChatMessage[];
  createdAt: number;
}

interface FileData {
  name: string;
  size: number;
  type: string;
  data: string;
  uploadedAt: number;
}

interface FileRoomData {
  type: "file";
  file: FileData | null;
  users: Map<string, UserInfo>;
  messages: ChatMessage[];
  createdAt: number;
}

interface CallRoomData {
  type: "call";
  callType: "audio" | "video";
  users: Map<string, UserInfo>;
  messages: ChatMessage[];
  createdAt: number;
}

type RoomData = CodeRoomData | FileRoomData | CallRoomData;

const rooms: Map<string, RoomData> = new Map();

// Create HTTP server
const httpServer = createServer((req, res) => {
  // Health check endpoint for Render
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

// Get allowed origins from environment or use defaults
const getAllowedOrigins = () => {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map(origin => origin.trim());
  }
  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://localhost:3000",
  ];
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        console.log(`Blocked origin: ${origin}`);
        callback(null, true);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: MAX_FILE_SIZE + 1024 * 100,
  pingTimeout: 20000,
  pingInterval: 10000,
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  let currentRoom: string | null = null;
  const userInfo: UserInfo = {
    id: socket.id,
    name: generateUsername(),
    color: generateUserColor(),
  };

  // Set username
  socket.on("set-username", (name: string) => {
    try {
      userInfo.name = name.slice(0, 20);
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.users.set(socket.id, userInfo);
        io.to(currentRoom).emit("users-update", {
          users: Array.from(room.users.values()),
        });
      }
    } catch (err) {
      console.error("Error in set-username:", err);
    }
  });

  // Code room handlers
  socket.on("join-room", (roomId: string) => {
    try {
      currentRoom = roomId;
      socket.join(roomId);

      const now = Date.now();
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          type: "code",
          code: "// Start coding here...\n",
          language: "javascript",
          theme: "vs-dark",
          users: new Map([[socket.id, userInfo]]),
          messages: [],
          createdAt: now,
        });
      } else {
        const room = rooms.get(roomId)!;
        if (room.users.size >= MAX_ROOM_SIZE) {
          socket.emit("room-error", { message: "Room is full (max 50 users)" });
          socket.leave(roomId);
          currentRoom = null;
          return;
        }
        room.users.set(socket.id, userInfo);
      }

      const roomData = rooms.get(roomId)! as CodeRoomData;
      socket.emit("room-data", {
        code: roomData.code,
        language: roomData.language,
        theme: roomData.theme,
        users: Array.from(roomData.users.values()),
        messages: roomData.messages.slice(-50),
        userInfo,
      });

      socket.to(roomId).emit("user-joined", {
        user: userInfo,
        users: Array.from(roomData.users.values()),
      });

      console.log(`User ${userInfo.name} joined code room ${roomId}. Users: ${roomData.users.size}`);
    } catch (err) {
      console.error("Error in join-room:", err);
    }
  });

  socket.on("code-change", (data: { roomId: string; code: string }) => {
    try {
      if (!checkRateLimit(socket.id, "code-change")) return;
      const { roomId, code } = data;
      if (typeof code === "string" && code.length > MAX_CODE_SIZE) {
        socket.emit("room-error", { message: "Code exceeds 500KB limit" });
        return;
      }
      const room = rooms.get(roomId);
      if (room && room.type === "code") {
        room.code = code;
        socket.to(roomId).emit("code-update", { code });
      }
    } catch (err) {
      console.error("Error in code-change:", err);
    }
  });

  socket.on("language-change", (data: { roomId: string; language: string }) => {
    try {
      const { roomId, language } = data;
      const room = rooms.get(roomId);
      if (room && room.type === "code") {
        room.language = language;
        socket.to(roomId).emit("language-update", { language });
      }
    } catch (err) {
      console.error("Error in language-change:", err);
    }
  });

  socket.on("theme-change", (data: { roomId: string; theme: string }) => {
    try {
      const { roomId, theme } = data;
      const room = rooms.get(roomId);
      if (room && room.type === "code") {
        room.theme = theme;
        socket.to(roomId).emit("theme-update", { theme });
      }
    } catch (err) {
      console.error("Error in theme-change:", err);
    }
  });

  // Cursor and selection
  socket.on("cursor-move", (data: { roomId: string; cursor: { lineNumber: number; column: number } }) => {
    try {
      if (!checkRateLimit(socket.id, "cursor-move")) return;
      const { roomId, cursor } = data;
      const room = rooms.get(roomId);
      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          user.cursor = cursor;
          socket.to(roomId).emit("cursor-update", {
            userId: socket.id,
            cursor,
            userName: user.name,
            userColor: user.color,
          });
        }
      }
    } catch (err) {
      console.error("Error in cursor-move:", err);
    }
  });

  socket.on("selection-change", (data: { roomId: string; selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null }) => {
    try {
      const { roomId, selection } = data;
      const room = rooms.get(roomId);
      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          user.selection = selection || undefined;
          socket.to(roomId).emit("selection-update", {
            userId: socket.id,
            selection,
            userName: user.name,
            userColor: user.color,
          });
        }
      }
    } catch (err) {
      console.error("Error in selection-change:", err);
    }
  });

  // Chat
  socket.on("chat-message", (data: { roomId: string; message: string }) => {
    try {
      if (!checkRateLimit(socket.id, "chat-message")) return;
      const { roomId, message } = data;
      const room = rooms.get(roomId);
      if (room && message.trim()) {
        const chatMessage: ChatMessage = {
          id: `${Date.now()}-${socket.id}`,
          userId: socket.id,
          userName: userInfo.name,
          userColor: userInfo.color,
          message: message.slice(0, 500),
          timestamp: Date.now(),
        };
        room.messages.push(chatMessage);
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }
        io.to(roomId).emit("new-message", chatMessage);
      }
    } catch (err) {
      console.error("Error in chat-message:", err);
    }
  });

  // WebRTC Signaling
  socket.on("webrtc-offer", (data: { roomId: string; targetId: string; offer: RTCSessionDescriptionInit }) => {
    try {
      socket.to(data.targetId).emit("webrtc-offer", {
        fromId: socket.id,
        fromName: userInfo.name,
        offer: data.offer,
      });
    } catch (err) {
      console.error("Error in webrtc-offer:", err);
    }
  });

  socket.on("webrtc-answer", (data: { roomId: string; targetId: string; answer: RTCSessionDescriptionInit }) => {
    try {
      socket.to(data.targetId).emit("webrtc-answer", {
        fromId: socket.id,
        answer: data.answer,
      });
    } catch (err) {
      console.error("Error in webrtc-answer:", err);
    }
  });

  socket.on("webrtc-ice-candidate", (data: { roomId: string; targetId: string; candidate: RTCIceCandidateInit }) => {
    try {
      socket.to(data.targetId).emit("webrtc-ice-candidate", {
        fromId: socket.id,
        candidate: data.candidate,
      });
    } catch (err) {
      console.error("Error in webrtc-ice-candidate:", err);
    }
  });

  socket.on("call-user", (data: { roomId: string; targetId: string; type: "audio" | "video" }) => {
    try {
      socket.to(data.targetId).emit("incoming-call", {
        fromId: socket.id,
        fromName: userInfo.name,
        type: data.type,
      });
    } catch (err) {
      console.error("Error in call-user:", err);
    }
  });

  socket.on("call-accepted", (data: { roomId: string; targetId: string }) => {
    try {
      socket.to(data.targetId).emit("call-accepted", { fromId: socket.id });
    } catch (err) {
      console.error("Error in call-accepted:", err);
    }
  });

  socket.on("call-rejected", (data: { roomId: string; targetId: string }) => {
    try {
      socket.to(data.targetId).emit("call-rejected", { fromId: socket.id });
    } catch (err) {
      console.error("Error in call-rejected:", err);
    }
  });

  socket.on("end-call", (data: { roomId: string; targetId: string }) => {
    try {
      socket.to(data.targetId).emit("call-ended", { fromId: socket.id });
    } catch (err) {
      console.error("Error in end-call:", err);
    }
  });

  // File room handlers
  socket.on("join-file-room", (roomId: string) => {
    try {
      currentRoom = roomId;
      socket.join(roomId);

      const now = Date.now();
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          type: "file",
          file: null,
          users: new Map([[socket.id, userInfo]]),
          messages: [],
          createdAt: now,
        });
      } else {
        const room = rooms.get(roomId)!;
        if (room.users.size >= MAX_ROOM_SIZE) {
          socket.emit("room-error", { message: "Room is full (max 50 users)" });
          socket.leave(roomId);
          currentRoom = null;
          return;
        }
        room.users.set(socket.id, userInfo);
      }

      const roomData = rooms.get(roomId)! as FileRoomData;
      socket.emit("file-room-data", {
        file: roomData.file,
        userCount: roomData.users.size,
        users: Array.from(roomData.users.values()),
        userInfo,
      });

      socket.to(roomId).emit("user-joined", {
        user: userInfo,
        userCount: roomData.users.size,
        users: Array.from(roomData.users.values()),
      });

      console.log(`User ${userInfo.name} joined file room ${roomId}. Users: ${roomData.users.size}`);
    } catch (err) {
      console.error("Error in join-file-room:", err);
    }
  });

  socket.on("file-upload", (data: { roomId: string; file: FileData }) => {
    try {
      const { roomId, file } = data;
      const room = rooms.get(roomId);
      if (room && room.type === "file") {
        if (file.size <= MAX_FILE_SIZE) {
          room.file = file;
          socket.to(roomId).emit("file-update", { file });
          console.log(`File uploaded to room ${roomId}: ${file.name} (${file.size} bytes)`);
        }
      }
    } catch (err) {
      console.error("Error in file-upload:", err);
    }
  });

  socket.on("file-remove", (data: { roomId: string }) => {
    try {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (room && room.type === "file") {
        room.file = null;
        io.to(roomId).emit("file-removed");
        console.log(`File removed from room ${roomId}`);
      }
    } catch (err) {
      console.error("Error in file-remove:", err);
    }
  });

  // Call room handlers
  socket.on("join-call-room", (data: { roomId: string; callType: "audio" | "video" }) => {
    try {
      const { roomId, callType } = data;
      currentRoom = roomId;
      socket.join(roomId);

      const now = Date.now();
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          type: "call",
          callType,
          users: new Map([[socket.id, userInfo]]),
          messages: [],
          createdAt: now,
        });
      } else {
        const room = rooms.get(roomId)!;
        if (room.users.size >= MAX_ROOM_SIZE) {
          socket.emit("room-error", { message: "Room is full (max 50 users)" });
          socket.leave(roomId);
          currentRoom = null;
          return;
        }
        room.users.set(socket.id, userInfo);
      }

      const roomData = rooms.get(roomId)! as CallRoomData;
      socket.emit("call-room-data", {
        users: Array.from(roomData.users.values()),
        messages: roomData.messages.slice(-50),
        userInfo,
      });

      socket.to(roomId).emit("user-joined-call", {
        user: userInfo,
        users: Array.from(roomData.users.values()),
      });

      console.log(`User ${userInfo.name} joined call room ${roomId}. Users: ${roomData.users.size}`);
    } catch (err) {
      console.error("Error in join-call-room:", err);
    }
  });

  socket.on("leave-call-room", (roomId: string) => {
    try {
      const room = rooms.get(roomId);
      if (room && room.type === "call") {
        room.users.delete(socket.id);
        socket.to(roomId).emit("user-left-call", {
          userId: socket.id,
          users: Array.from(room.users.values()),
        });
        socket.leave(roomId);
        console.log(`User ${userInfo.name} left call room ${roomId}. Users: ${room.users.size}`);
      }
    } catch (err) {
      console.error("Error in leave-call-room:", err);
    }
  });

  // Emoji reactions
  socket.on("emoji-reaction", (data: { roomId: string; emoji: string }) => {
    try {
      const { roomId, emoji } = data;
      const room = rooms.get(roomId);
      if (room) {
        io.to(roomId).emit("emoji-reaction", {
          emoji,
          userName: userInfo.name,
          userColor: userInfo.color,
        });
      }
    } catch (err) {
      console.error("Error in emoji-reaction:", err);
    }
  });

  socket.on("disconnect", () => {
    try {
      console.log("Client disconnected:", socket.id);
      rateLimiters.delete(socket.id);
      if (currentRoom && rooms.has(currentRoom)) {
        const roomData = rooms.get(currentRoom)!;
        roomData.users.delete(socket.id);

        if (roomData.type === "code") {
          socket.to(currentRoom).emit("user-left", {
            userId: socket.id,
            users: Array.from(roomData.users.values()),
          });
        } else if (roomData.type === "file") {
          socket.to(currentRoom).emit("user-left", {
            userId: socket.id,
            users: Array.from(roomData.users.values()),
            userCount: roomData.users.size,
          });
        } else if (roomData.type === "call") {
          socket.to(currentRoom).emit("user-left-call", {
            userId: socket.id,
            users: Array.from(roomData.users.values()),
          });
        }

        if (roomData.users.size === 0) {
          const roomToDelete = currentRoom;
          setTimeout(() => {
            if (rooms.has(roomToDelete) && rooms.get(roomToDelete)!.users.size === 0) {
              rooms.delete(roomToDelete);
              console.log(`Room ${roomToDelete} deleted (empty)`);
            }
          }, 5 * 60 * 1000);
        }
      }
    } catch (err) {
      console.error("Error in disconnect:", err);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.IO server running on port ${port}`);
  console.log(`> Health check: http://localhost:${port}/health`);
  console.log(`> Allowed origins: ${getAllowedOrigins().join(", ")}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\nShutting down gracefully...");
  io.close(() => {
    console.log("Socket.IO server closed");
    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
