import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

type RoomData = CodeRoomData | FileRoomData;

const rooms: Map<string, RoomData> = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: MAX_FILE_SIZE + 1024 * 100,
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

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      if (currentRoom && rooms.has(currentRoom)) {
        const roomData = rooms.get(currentRoom)!;
        roomData.users.delete(socket.id);

        const userData = roomData.type === "code"
          ? { oderId: socket.id, users: Array.from(roomData.users.values()) }
          : { userId: socket.id, users: Array.from(roomData.users.values()), userCount: roomData.users.size };

        socket.to(currentRoom).emit("user-left", userData);

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
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server running`);
  });
});
