import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    // Use jsdom for browser-like environment
    environment: 'jsdom',
    
    // Global test APIs
    globals: true,
    
    // Setup files
    setupFiles: ['./tests/setup.js'],
    
    // Test file patterns
    include: ['tests/**/*.test.js'],
    
    // Coverage
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
      ],
    },
    
    // Resolve aliases to match your project structure
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/js'),
      },
    },
  },
});