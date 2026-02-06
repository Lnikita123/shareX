import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const port = parseInt(process.env.PORT || "3001", 10);

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

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
  // Default origins for development
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
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if origin is allowed
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        console.log(`Blocked origin: ${origin}`);
        callback(null, true); // For now allow all, but log blocked
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: MAX_FILE_SIZE + 1024 * 100,
  pingTimeout: 60000,
  pingInterval: 25000,
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
    userInfo.name = name.slice(0, 20); // Limit to 20 chars
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom)!;
      room.users.set(socket.id, userInfo);
      io.to(currentRoom).emit("users-update", {
        users: Array.from(room.users.values()),
      });
    }
  });

  // Code room handlers
  socket.on("join-room", (roomId: string) => {
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
      room.users.set(socket.id, userInfo);
    }

    const roomData = rooms.get(roomId)! as CodeRoomData;
    socket.emit("room-data", {
      code: roomData.code,
      language: roomData.language,
      theme: roomData.theme,
      users: Array.from(roomData.users.values()),
      messages: roomData.messages.slice(-50), // Last 50 messages
      userInfo,
    });

    socket.to(roomId).emit("user-joined", {
      user: userInfo,
      users: Array.from(roomData.users.values()),
    });

    console.log(`User ${userInfo.name} joined code room ${roomId}. Users: ${roomData.users.size}`);
  });

  socket.on("code-change", (data: { roomId: string; code: string }) => {
    const { roomId, code } = data;
    const room = rooms.get(roomId);
    if (room && room.type === "code") {
      room.code = code;
      socket.to(roomId).emit("code-update", { code });
    }
  });

  socket.on("language-change", (data: { roomId: string; language: string }) => {
    const { roomId, language } = data;
    const room = rooms.get(roomId);
    if (room && room.type === "code") {
      room.language = language;
      socket.to(roomId).emit("language-update", { language });
    }
  });

  socket.on("theme-change", (data: { roomId: string; theme: string }) => {
    const { roomId, theme } = data;
    const room = rooms.get(roomId);
    if (room && room.type === "code") {
      room.theme = theme;
      socket.to(roomId).emit("theme-update", { theme });
    }
  });

  // Cursor and selection
  socket.on("cursor-move", (data: { roomId: string; cursor: { lineNumber: number; column: number } }) => {
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
  });

  socket.on("selection-change", (data: { roomId: string; selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null }) => {
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
  });

  // Chat
  socket.on("chat-message", (data: { roomId: string; message: string }) => {
    const { roomId, message } = data;
    const room = rooms.get(roomId);
    if (room && message.trim()) {
      const chatMessage: ChatMessage = {
        id: `${Date.now()}-${socket.id}`,
        userId: socket.id,
        userName: userInfo.name,
        userColor: userInfo.color,
        message: message.slice(0, 500), // Limit message length
        timestamp: Date.now(),
      };
      room.messages.push(chatMessage);
      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
      io.to(roomId).emit("new-message", chatMessage);
    }
  });

  // WebRTC Signaling
  socket.on("webrtc-offer", (data: { roomId: string; targetId: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(data.targetId).emit("webrtc-offer", {
      fromId: socket.id,
      fromName: userInfo.name,
      offer: data.offer,
    });
  });

  socket.on("webrtc-answer", (data: { roomId: string; targetId: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(data.targetId).emit("webrtc-answer", {
      fromId: socket.id,
      answer: data.answer,
    });
  });

  socket.on("webrtc-ice-candidate", (data: { roomId: string; targetId: string; candidate: RTCIceCandidateInit }) => {
    socket.to(data.targetId).emit("webrtc-ice-candidate", {
      fromId: socket.id,
      candidate: data.candidate,
    });
  });

  socket.on("call-user", (data: { roomId: string; targetId: string; type: "audio" | "video" }) => {
    socket.to(data.targetId).emit("incoming-call", {
      fromId: socket.id,
      fromName: userInfo.name,
      type: data.type,
    });
  });

  socket.on("call-accepted", (data: { roomId: string; targetId: string }) => {
    socket.to(data.targetId).emit("call-accepted", { fromId: socket.id });
  });

  socket.on("call-rejected", (data: { roomId: string; targetId: string }) => {
    socket.to(data.targetId).emit("call-rejected", { fromId: socket.id });
  });

  socket.on("end-call", (data: { roomId: string; targetId: string }) => {
    socket.to(data.targetId).emit("call-ended", { fromId: socket.id });
  });

  // File room handlers
  socket.on("join-file-room", (roomId: string) => {
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
  });

  socket.on("file-upload", (data: { roomId: string; file: FileData }) => {
    const { roomId, file } = data;
    const room = rooms.get(roomId);
    if (room && room.type === "file") {
      if (file.size <= MAX_FILE_SIZE) {
        room.file = file;
        socket.to(roomId).emit("file-update", { file });
        console.log(`File uploaded to room ${roomId}: ${file.name} (${file.size} bytes)`);
      }
    }
  });

  socket.on("file-remove", (data: { roomId: string }) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    if (room && room.type === "file") {
      room.file = null;
      io.to(roomId).emit("file-removed");
      console.log(`File removed from room ${roomId}`);
    }
  });

  // Call room handlers
  socket.on("join-call-room", (data: { roomId: string; callType: "audio" | "video" }) => {
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
  });

  socket.on("leave-call-room", (roomId: string) => {
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
  });

  // Emoji reactions
  socket.on("emoji-reaction", (data: { roomId: string; emoji: string }) => {
    const { roomId, emoji } = data;
    const room = rooms.get(roomId);
    if (room) {
      io.to(roomId).emit("emoji-reaction", {
        emoji,
        userName: userInfo.name,
        userColor: userInfo.color,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom)!;
      roomData.users.delete(socket.id);

      if (roomData.type === "code") {
        socket.to(currentRoom).emit("user-left", {
          oderId: socket.id,
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

      // Delete empty rooms after 5 minutes
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
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.IO server running on port ${port}`);
  console.log(`> Health check: http://localhost:${port}/health`);
  console.log(`> Allowed origins: ${getAllowedOrigins().join(", ")}`);
});
