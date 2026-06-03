import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { installStaticApi } from './utils/staticApi'

// Static-data demo mode: route all /api/* fetches to bundled JSON.
// Disable by setting VITE_USE_LIVE_API=true at build time.
if (import.meta.env.VITE_USE_LIVE_API !== 'true') {
  installStaticApi()
}

// NOTE: React.StrictMode deliberately removed.
// StrictMode double-mounts/unmounts every component in development,
// which destroys and recreates the Three.js WebGL context, causing
// the 3D Digital Twin viewer to crash ~1 second after appearing.
// R3F (React Three Fiber) is a known incompatibility.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
