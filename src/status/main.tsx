import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { mountNav, requireAdmin } from '../shared/nav';

mountNav('status');
const rootEl = document.getElementById('root')!;
requireAdmin(rootEl, () =>
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
