import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// 멀티 페이지 구성: 각 앱의 화면/CSS를 페이지 단위로 격리하고 로그인·DB 모듈만 공유합니다.
//   /          시험 시간표 자동 생성 (일반 교사 조회 가능)
//   /status/   시험 현황 자동화 (관리자)
//   /docs/     응시현황표·자리배치표 생성 (관리자)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  build: {
    rollupOptions: {
      input: {
        timetable: path.resolve(__dirname, 'index.html'),
        status: path.resolve(__dirname, 'status/index.html'),
        docs: path.resolve(__dirname, 'docs/index.html'),
      },
    },
  },
});
