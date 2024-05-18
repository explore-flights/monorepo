import { resolve } from 'path';
import { defineConfig, ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

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
  }
}

const proxyConfig: Record<string, string | ProxyOptions> = {
  '/api/': localTarget('http://127.0.0.1:8080'),
  '/auth/': localTarget('http://127.0.0.1:8080'),
  '/data/': localTarget('http://127.0.0.1:8080'),
};

export default defineConfig({
  root: resolve(__dirname, 'src/pages'),
  publicDir: resolve(__dirname, 'public'),
  plugins: [react()],
  server: {
    port: 4200,
    proxy: proxyConfig,
  },
  build: {
    outDir: resolve(__dirname, './dist'),
  },
});
