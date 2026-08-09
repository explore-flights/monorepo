import { resolve } from 'path';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
function localTarget(target: string): ProxyOptions {
  return {
    target: target,
    changeOrigin: false,
    headers: {
      'Cloudfront-Viewer-Country': 'DE',
      'Cloudfront-Viewer-City': 'Berlin',
      'Cloudfront-Viewer-Latitude': '52.5162778',
      'Cloudfront-Viewer-Longitude': '13.3755154',
    },
  };
}

const proxyConfig: Record<string, string | ProxyOptions> = {
  '/api/': localTarget('http://127.0.0.1:8080'),
  '/auth/': localTarget('http://127.0.0.1:8080'),
  '/data/': localTarget('http://127.0.0.1:8080'),
};

export default defineConfig({
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, 'public'),
  envDir: resolve(import.meta.dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 4200,
    proxy: proxyConfig,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
  },
});
