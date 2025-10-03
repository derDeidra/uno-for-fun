import dotenv from "dotenv";

dotenv.config();

export interface ServerEnv {
  port: number;
  host: string;
  publicAddress?: string;
}

export function loadEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? 2567);
  const host = process.env.HOST ?? "0.0.0.0";
  const publicAddress = process.env.PUBLIC_ADDRESS;
  return { port, host, publicAddress };
}
