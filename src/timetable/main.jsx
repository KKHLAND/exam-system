import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { mountNav } from '../shared/nav';

// 시험 시간표: 로그인 없이 누구나 조회, 관리자 기능은 로그인 시에만 표시
mountNav('timetable');
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
