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
  envDir: resolve(__dirname),
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  server: {
    port: 4200,
    proxy: proxyConfig,
    /*headers: {
      'content-security-policy': [
        `default-src 'self'`,
        `connect-src 'self' http://127.0.0.1:8090/ https://tiles.versatiles.org/`,
        `style-src 'self' 'unsafe-inline'`,
        `font-src data:`,
        `img-src 'self' data: blob:`,
        `worker-src blob:`,
        `child-src blob:`,
      ].join('; '),
    },*/
  },
  build: {
    outDir: resolve(__dirname, './dist'),
  },
});
