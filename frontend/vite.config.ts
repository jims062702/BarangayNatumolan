import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Big libraries in their own chunks so browsers keep them cached
        // across app updates (only the small app chunk re-downloads).
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          swiper: ["swiper", "swiper/react"],
        },
      },
    },
  },
});
