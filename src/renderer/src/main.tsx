import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyAccent, readStoredAccent } from '@/lib/accent-theme'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

applyAccent(readStoredAccent())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        toastOptions={{
          classNames: {
            toast: 'gf-toast gf-no-drag',
            title: 'gf-toast__title',
            description: 'gf-toast__description',
            closeButton: 'gf-toast__close gf-no-drag',
            default: 'gf-toast--accent',
            success: 'gf-toast--accent',
            info: 'gf-toast--accent',
            warning: 'gf-toast--accent',
            loading: 'gf-toast--accent',
            error: 'gf-toast--error',
          },
        }}
      />
    </TooltipProvider>
  </React.StrictMode>
)
