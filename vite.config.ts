import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      csp: {
        mode: "nonce",
        directives: {
          "default-src": ["self"],
          "base-uri": ["self"],
          "connect-src": ["self"],
          "font-src": ["self"],
          "form-action": ["self"],
          "frame-ancestors": ["none"],
          "img-src": ["self", "data:"],
          "object-src": ["none"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"]
        }
      }
    })
  ]
});
