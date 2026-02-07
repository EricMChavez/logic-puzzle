import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './assets/styles/tokens.css'
import './assets/styles/theme-dark.css'
import './assets/styles/theme-light.css'
import './assets/styles/animations.css'
import { initTheme } from './shared/tokens/index.ts'
import App from './App.tsx'

// Initialize theme system before first render
initTheme('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
