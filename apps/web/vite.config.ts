import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react"
          }
          if (id.includes("node_modules/recharts")) {
            return "recharts"
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons"
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
})
