import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getApi } from './api'
import { AppProvider } from './state'
import { ConfirmProvider } from './components/ui'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider api={getApi()}>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </AppProvider>
  </StrictMode>
)
