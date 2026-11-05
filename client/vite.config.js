import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: { allow: [
      fileURLToPath(new URL(".", import.meta.url)),
      fileURLToPath(new URL("../shared", import.meta.url)),
    ] },
  },
});