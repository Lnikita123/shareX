import { io, Socket } from "socket.io-client";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error" | "warming-up";
type StateChangeCallback = (state: ConnectionState) => void;

let socket: Socket | null = null;
let connectionState: ConnectionState = "disconnected";
const stateListeners = new Set<StateChangeCallback>();

function setConnectionState(state: ConnectionState) {
  // Don't let lower-priority states override higher-priority ones
  if (state === "warming-up" && (connectionState === "connected" || connectionState === "connecting")) return;
  connectionState = state;
  stateListeners.forEach((cb) => cb(state));
}

const getServerUrl = () =>
  process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

// Wake up the Render server (fire-and-forget alongside socket connection)
function warmUpServer(serverUrl: string): void {
  // Skip warm-up for local development
  if (serverUrl === window.location.origin) return;

  setConnectionState("warming-up");
  fetch(`${serverUrl}/health`, { mode: "cors" }).catch(() => {
    // Server might be cold-starting — socket.io will retry anyway
  });
}

export const getSocket = (): Socket => {
  if (!socket) {
    const serverUrl = getServerUrl();

    // Warm up Render server in parallel with socket connection
    warmUpServer(serverUrl);

    socket = io(serverUrl, {
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      setConnectionState("connected");
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.log("connect_error:", err?.message || err);
      setConnectionState("error");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionState("connecting");
    });

    socket.io.on("reconnect", () => {
      setConnectionState("connected");
    });
  }
  return socket;
};

export const waitForConnection = (): Promise<Socket> => {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);

  return new Promise((resolve) => {
    const onConnect = () => {
      s.off("connect", onConnect);
      resolve(s);
    };
    s.on("connect", onConnect);
  });
};

export const getConnectionState = (): ConnectionState => {
  return connectionState;
};

export const onConnectionStateChange = (cb: StateChangeCallback): (() => void) => {
  stateListeners.add(cb);
  return () => {
    stateListeners.delete(cb);
  };
};

export const reconnectSocket = () => {
  if (socket && !socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    setConnectionState("disconnected");
  }
};
