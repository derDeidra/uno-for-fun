import { loadEnv } from "./env";
import { createColyseusApp } from "./colyseus";

async function main() {
  const env = loadEnv();
  const { httpServer } = createColyseusApp();
  httpServer.listen(env.port, env.host, () => {
    console.log(`Uno server listening on ${env.host}:${env.port}`);
  });
}

main().catch((err) => {
  console.error("Server failed", err);
  process.exit(1);
});
