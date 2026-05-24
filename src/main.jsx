import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

// Cinematic scroll-reveal via IntersectionObserver
const revealObserver = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } }),
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);
const mutationObs = new MutationObserver(() => {
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
});
mutationObs.observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
