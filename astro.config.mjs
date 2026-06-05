// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { host: true },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: [
        "yt-dlp-wrap",
        "fluent-ffmpeg",
        "ffmpeg-static",
        "archiver",
        "postgres",
      ],
    },
  },
});
