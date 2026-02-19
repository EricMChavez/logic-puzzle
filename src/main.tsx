import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './assets/styles/tokens.css'
import './assets/styles/theme-dark.css'
import './assets/styles/theme-light.css'
import './assets/styles/animations.css'
import './assets/styles/fonts.css'
import { initTheme } from './shared/tokens/index.ts'
import { initAudio } from './shared/audio/index.ts'
import { initKnobMode } from './shared/settings/knob-mode.ts'
import App from './App.tsx'

// Initialize theme system before first render
initTheme('dark')

// Initialize knob mode preference from localStorage
initKnobMode()

// Pre-load audio buffers (async, non-blocking)
initAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
