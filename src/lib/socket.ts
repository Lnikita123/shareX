import { io, Socket } from "socket.io-client";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type StateChangeCallback = (state: ConnectionState) => void;

let socket: Socket | null = null;
let connectionState: ConnectionState = "disconnected";
const stateListeners = new Set<StateChangeCallback>();

function setConnectionState(state: ConnectionState) {
  connectionState = state;
  stateListeners.forEach((cb) => cb(state));
}

export const getSocket = (): Socket => {
  if (!socket) {
    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

    setConnectionState("connecting");

    socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      setConnectionState("connected");
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", () => {
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
