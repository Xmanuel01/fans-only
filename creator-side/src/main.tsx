import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './base.css';

const redirectPath = sessionStorage.getItem('redirect-path');
if (redirectPath) {
  sessionStorage.removeItem('redirect-path');
  window.history.replaceState(null, '', redirectPath);
}

document.body.classList.add('react-page');

const rootElement = document.getElementById('react-root');

if (!rootElement) {
  throw new Error('Missing #react-root element');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
