# Mazey frontend

This repository now contains only the React/Vite frontend. All HTTP and Socket.IO traffic is expected to go to the standalone NestJS API running locally in Docker.

## Local development

**Prerequisites:** Node.js 22 and the Nest API container running on `http://localhost:4000`

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Start the Nest API container from `../../nest/mazey-api`
4. Run the frontend: `npm run dev`

The frontend defaults to:

- REST API: `http://localhost:4000/api`
- Socket.IO: `http://localhost:4000`
