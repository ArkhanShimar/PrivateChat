# 💕 LoveChat — Private Romantic Chat App

A full-stack MERN real-time chat app for two people. Built with Next.js, Express, Socket.IO, and MongoDB.

---

## Project Structure

```
/backend    Express + Socket.IO + MongoDB API
/frontend   Next.js romantic chat UI
```

---

## Local Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values (MongoDB URI, JWT secret, Cloudinary optional)
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOCKET_URL to your backend URL
npm run dev
```

Open http://localhost:3000

---

## Environment Variables

### Backend `.env`
| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | Token expiry (e.g. `7d`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (optional) |
| `CLOUDINARY_API_KEY` | Cloudinary API key (optional) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (optional) |
| `CLIENT_URL` | Frontend URL for CORS |

### Frontend `.env.local`
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_SOCKET_URL` | Backend Socket.IO URL |

---

## Deployment

### Backend → Render or Railway

1. Push backend folder to GitHub
2. Create a new Web Service on [Render](https://render.com) or [Railway](https://railway.app)
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add all environment variables from `.env`

### Frontend → Vercel

1. Push frontend folder to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL` = your Render/Railway backend URL
   - `NEXT_PUBLIC_SOCKET_URL` = same backend URL
4. Deploy

### MongoDB → MongoDB Atlas

1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user
3. Whitelist `0.0.0.0/0` for IP access (or specific IPs)
4. Copy the connection string to `MONGODB_URI`

---

## Features

- 🔐 Register with name + password + 4-digit PIN
- 🔒 Max 2 users — registration auto-closes
- 📱 iOS-style PIN lock screen with shake animation
- 💬 Real-time chat via Socket.IO
- 📷 Image sharing (Cloudinary or base64 fallback)
- ↩️ Reply to specific messages
- ✓✓ Seen receipts
- 💭 Typing indicator
- 🌸 Floating hearts animation
- 💌 Rotating romantic quotes
- 🔔 Subtle notification sound
- 📱 Mobile-first responsive design

---

## Security

- Passwords and PINs hashed with bcrypt (cost factor 12)
- JWT stored in HTTP-only cookies + localStorage fallback
- Sensitive fields stripped from all API responses
- Route protection middleware on all private endpoints
