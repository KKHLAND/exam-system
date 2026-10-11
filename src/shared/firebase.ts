import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// 통합 앱이 사용하는 단일 Firebase 프로젝트 (기존 2·3번 앱과 동일)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCe28-jzi5S2EPXYkcYPkjwfiLYWvMWAk0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'test-e7132.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'test-e7132',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'test-e7132.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '330440137731',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:330440137731:web:58185c4d51886e74f30236',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-B33GZ6GZ0L',
};

export const app = initializeApp(firebaseConfig);
// 학교 내부망 프록시 환경을 고려해 2번 앱과 같이 롱 폴링 자동 감지 사용
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const auth = getAuth(app);

// 1번 앱(시험 현황 자동화)이 쓰던 기존 프로젝트: 데이터 이전(읽기 전용) 용도로만 사용
export const legacyStatusConfig = {
  apiKey: 'AIzaSyBtcADEqygV-uzZvM_dpm2cOb5kN69oNrI',
  authDomain: 'elective-70356.firebaseapp.com',
  projectId: 'elective-70356',
  storageBucket: 'elective-70356.firebasestorage.app',
  messagingSenderId: '669132892409',
  appId: '1:669132892409:web:9bdfbcd098755ed0ea9a28',
};
