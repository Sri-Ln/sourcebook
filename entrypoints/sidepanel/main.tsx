import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './style.css';

const container = document.getElementById('root');
if (!container) throw new Error('side panel root element missing');

createRoot(container).render(<App />);
