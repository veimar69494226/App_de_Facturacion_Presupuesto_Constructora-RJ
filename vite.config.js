import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  //  para que funcione en Electron empaquetado (file://)
  base: "./",
});
