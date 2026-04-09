# CodeNest

Real-time collaborative platform for code editing, file sharing, and audio/video calls. No sign-up required.

**Live:** [share-nikita.vercel.app](https://share-nikita.vercel.app)

## Features

- **Code Editor** — Real-time collaborative editing powered by Monaco Editor with syntax highlighting for 19+ languages, cursor tracking, and text selection sync
- **File Sharing** — Share files up to 4MB with anyone in the room
- **Audio/Video Calls** — WebRTC-based mesh calls with up to 6 peers, emoji reactions, and screen sharing
- **Chat** — In-room messaging across all modes
- **No Sign-Up** — Generate a random display name or choose your own, then share the room link

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Monaco Editor
- **Real-time:** Socket.IO (polling + WebSocket upgrade)
- **Calls:** WebRTC with TURN server support
- **Deployment:** Vercel (frontend) + Render (socket server)

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local
```

### Running

Start both the Next.js frontend and socket server:

```bash
# Option 1: Run both together (uses server.ts)
npm run dev

# Option 2: Run separately
npm run dev:next    # Next.js on port 3000
npm run dev:socket  # Socket server on port 3001
```

If running separately, set in `.env.local`:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

### Optional: TURN Server

For reliable WebRTC calls behind NATs/firewalls, add TURN credentials to `.env.local`:

```env
NEXT_PUBLIC_TURN_USERNAME=your_username
NEXT_PUBLIC_TURN_CREDENTIAL=your_credential
```

Free TURN servers available at [metered.ca](https://www.metered.ca/).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full production deployment instructions.

### Quick Overview

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | `share-nikita.vercel.app` |
| Socket Server | Render | `codeshare-socket.onrender.com` |

### Key Environment Variables

**Vercel (Frontend):**

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SOCKET_URL` | `https://codeshare-socket.onrender.com` |
| `NEXT_PUBLIC_TURN_USERNAME` | *(optional)* TURN credentials |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | *(optional)* TURN credentials |

**Render (Socket Server):**

| Variable | Value |
|----------|-------|
| `PORT` | `10000` (Render default) |
| `ALLOWED_ORIGINS` | `https://share-nikita.vercel.app` |

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home page (room creation/joining)
│   │   └── [roomId]/page.tsx     # Room page with tab navigation
│   ├── components/
│   │   ├── CodeEditor.tsx        # Monaco-based collaborative editor
│   │   ├── FileShare.tsx         # File upload/download
│   │   ├── CallRoom.tsx          # WebRTC mesh video/audio
│   │   ├── VideoCall.tsx         # 1-to-1 call component
│   │   ├── ChatSidebar.tsx       # In-room chat UI
│   │   ├── ConnectionStatus.tsx  # Socket connection indicator
│   │   └── UsernameModal.tsx     # Display name input
│   └── lib/
│       ├── socket.ts             # Socket.IO client singleton
│       └── user-context.tsx      # Username context (localStorage)
├── socket-server.ts              # Socket.IO server (standalone)
├── server.ts                     # Combined dev server
└── .env.example                  # Environment variable template
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start combined dev server |
| `npm run dev:next` | Start Next.js only |
| `npm run dev:socket` | Start socket server only |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run start:socket` | Start production socket server |
| `npm run lint` | Run ESLint |
