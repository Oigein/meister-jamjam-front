import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY;
  return {
    plugins: [react()],
    server: {
      // 개발 중 /api, /auth 요청을 백엔드로 넘김 → 같은 도메인처럼 동작해 세션 쿠키 유지
      proxy: target ? { '/api': { target, changeOrigin: true }, '/auth': { target, changeOrigin: true } } : undefined,
    },
  };
});
