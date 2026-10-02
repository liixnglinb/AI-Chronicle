import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/errors'
import { applyTheme, getInitialTheme } from './lib/theme'

// 先落主题再渲染：即使 App 抛错，兜底界面也能拿到正确的深浅配色
applyTheme(getInitialTheme())
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
