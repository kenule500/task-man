import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme'

// Apply the saved light/dark/system preference before the first render (no inline script: the CSP forbids it)
initTheme()

createRoot(document.getElementById('root')!).render(
  <App />,
)
