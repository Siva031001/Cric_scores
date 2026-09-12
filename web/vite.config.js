import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base '/' assumes this is deployed at its own domain/subpath root (e.g. a
// Vercel project rooted at this "web" folder, same deploy shape already used
// for "admin"). Change `base` here if it ends up served from a sub-path.
export default defineConfig({
  plugins: [react()],
});
