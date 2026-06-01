import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");

  return {
    plugins: [react()],
    define: {
      "process.env": env,
    },
  };
});
