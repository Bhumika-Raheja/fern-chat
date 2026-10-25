import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { initSockets } from "./sockets/index.js";

const server = http.createServer(app);
initSockets(server);

async function start() {
  try {
    await connectDB();
    server.listen(env.PORT, () => {
      console.log(`Fern server running on port ${env.PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

start();