import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
export default defineConfig({
	base: "/dji-exposure/",
	plugins: [preact()],
	optimizeDeps: { include: ["mp4box", "protobufjs/minimal"] },
	build: { target: "es2022" },
});
