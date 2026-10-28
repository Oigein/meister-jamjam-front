import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      // 개발 중 백엔드가 뜨면 VITE_API_PROXY=http://localhost:8080 처럼 지정 → /api 요청을 넘겨줌
      proxy: env.VITE_API_PROXY ? { '/api': { target: env.VITE_API_PROXY, changeOrigin: true } } : undefined,
    },
  };
});
