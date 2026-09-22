import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '');
        return path.resolve(__dirname, 'frontend/src/assets', filename);
      }
    },
  };
}

export default defineConfig({
  plugins: [figmaAssetResolver(), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './frontend/src') } },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    manifest: 'manifest.json',
    outDir: 'public/build',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'frontend/src/main.tsx') },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: false },
});
