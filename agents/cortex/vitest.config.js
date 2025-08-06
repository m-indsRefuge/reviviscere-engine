// vite.config.js
import { defineConfig } from 'vite';
import path from 'path'; // Import the path module

export default defineConfig({
  test: {
    // Vitest configuration options can go here
  },
  resolve: {
    alias: {
      // Use path.resolve for a more robust, cross-platform-compatible path
      '@': path.resolve(__dirname, './src'),
      '@metrics': path.resolve(__dirname, './metrics'),
    },
  },
});