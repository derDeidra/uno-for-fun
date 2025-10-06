# uno-for-fun

Monorepo for a GPU-accelerated multiplayer UNO-like card game built with TypeScript across an engine, server, and Phaser client.

## Prerequisites
- Node.js 18 or newer (the tooling is tested with Node 18 LTS)
- `pnpm` 8 (recommended via `corepack enable`)

## Initial setup
```sh
corepack enable pnpm
pnpm install
```
This installs dependencies for every workspace package defined in `pnpm-workspace.yaml`.

## Development workflows
- `pnpm dev` runs the protocol and engine builds in watch mode alongside the Colyseus server and Vite client. `predev` will do an initial one-off build of the shared packages before watchers start. The server listens on `PORT` (defaults to `2567`) and the client serves on Vite's default port (`5173`).
- `pnpm --filter @game/server dev` runs the server only with hot reload via `tsx watch`.
- `pnpm --filter @game/client dev` runs the Phaser web client via Vite.
- `pnpm --filter @game/engine dev` rebuilds the shared engine library in watch mode.
- `pnpm --filter @game/protocol dev` rebuilds the shared protocol schemas in watch mode.

Both the client and server rely on the shared `@game/engine` and `@game/protocol` packages, so keep their watch builds running if you are editing them outside the combined `pnpm dev` script.

## Environment configuration
The server reads the following variables from `apps/server/.env` (loaded with `dotenv`):
- `PORT`: TCP port to bind (`2567` by default)
- `HOST`: interface to listen on (`0.0.0.0` by default)
- `PUBLIC_ADDRESS`: optional public URL clients should use to reach the server

Example `.env`:
```
PORT=2567
HOST=0.0.0.0
PUBLIC_ADDRESS=http://localhost:2567
```

## Build & release
- `pnpm build` builds every workspace package (engine, protocol, server, client) using `tsup`/`vite`.
- `pnpm --filter @game/server start` runs the compiled server from `apps/server/dist`.
- `pnpm --filter @game/client build` produces the static client bundle in `apps/client/dist`.

## Testing
- `pnpm test` executes the Vitest suite in `packages/engine`.
- `pnpm --filter @game/engine test -- --watch` runs tests in watch mode while iterating on engine logic.

## Project layout
```
apps/client     # Phaser + Vite frontend
apps/server     # Colyseus server hosting Uno rooms
packages/engine # Shared game engine and rules
packages/protocol # Shared schema and validation helpers
```
