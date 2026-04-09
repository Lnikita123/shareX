# Deployment Guide

CodeNest runs as two services:
- **Frontend (Next.js)** on Vercel
- **Socket Server (Node.js)** on Render

## Socket Server on Render

### Setup

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `codeshare-socket` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npx tsx socket-server.ts` |
| **Plan** | Free (or Starter for no cold starts) |

4. Set environment variables:

| Variable | Value |
|----------|-------|
| `PORT` | `10000` |
| `ALLOWED_ORIGINS` | `https://share-nikita.vercel.app` |

### Cold Start Behavior (Free Tier)

Render's free tier spins down after ~15 minutes of inactivity. When a user connects:

1. The client sends a health check to `/health` to wake up the server
2. The UI shows "Starting server..." (orange indicator) during warm-up
3. Socket.IO uses polling first, then upgrades to WebSocket
4. Connection timeout is set to 20 seconds to tolerate cold starts
5. Auto-reconnection retries with exponential backoff up to 10 seconds

To avoid cold starts, upgrade to Render's **Starter plan** ($7/month) which keeps the service running.

### Health Check

Render pings the health endpoint to monitor the service. The server exposes:

```
GET /health
→ {"status":"ok","rooms":0}
```

### CORS

The socket server handles CORS at two levels:
- **HTTP level** — The health endpoint returns `Access-Control-Allow-Origin` for allowed origins
- **Socket.IO level** — Socket.IO's built-in CORS handles WebSocket/polling connections

Allowed origins are configured via the `ALLOWED_ORIGINS` environment variable (comma-separated).

## Frontend on Vercel

### Setup

1. Import the repository on [Vercel](https://vercel.com)
2. Framework preset: **Next.js** (auto-detected)
3. Set environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SOCKET_URL` | `https://codeshare-socket.onrender.com` |
| `NEXT_PUBLIC_TURN_USERNAME` | *(optional)* TURN server username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | *(optional)* TURN server credential |

### Important Notes

- `NEXT_PUBLIC_SOCKET_URL` is baked into the client bundle at build time. If you change the socket server URL, you must redeploy the frontend.
- Leave `NEXT_PUBLIC_SOCKET_URL` empty for local development (defaults to `window.location.origin`).

## Socket Connection Flow

```
Client                          Render (Socket Server)
  │                                    │
  ├─── GET /health ───────────────────►│  (wake up server)
  │    UI: "Starting server..."        │
  │                                    │
  ├─── Socket.IO polling ────────────►│  (HTTP long-polling)
  │    UI: "Connecting..."             │
  │                                    │
  │◄── Socket.IO handshake ───────────┤  (session established)
  │                                    │
  ├─── Upgrade to WebSocket ─────────►│  (if supported)
  │    UI: "Connected"                 │
  │                                    │
  ├─── join-room / join-file-room ───►│  (enter collaboration room)
  │◄── room-data ─────────────────────┤  (sync initial state)
  │                                    │
```

## Adding a Custom Domain

### Frontend
Add a custom domain in Vercel project settings → Domains.

### Socket Server
1. Add a custom domain in Render service settings
2. Update `NEXT_PUBLIC_SOCKET_URL` on Vercel to the new domain
3. Update `ALLOWED_ORIGINS` on Render to include the frontend's new domain
4. Redeploy both services

## Troubleshooting

### "Disconnected" or "Reconnecting" on first visit
- **Cause:** Render free tier cold start (30-60 seconds)
- **Fix:** Wait for the server to warm up, or upgrade to Render Starter plan

### Socket connects but immediately disconnects
- **Cause:** CORS misconfiguration
- **Fix:** Ensure `ALLOWED_ORIGINS` on Render includes the exact frontend URL (with `https://`, no trailing slash)

### WebRTC calls fail behind corporate firewalls
- **Cause:** Direct peer connections blocked
- **Fix:** Configure TURN server credentials in Vercel environment variables

### Chat/code sync works but calls don't
- **Cause:** Missing TURN servers for NAT traversal
- **Fix:** Sign up at [metered.ca](https://www.metered.ca/) and add credentials to environment variables
