import React from 'react'
import ReactDOM from 'react-dom/client'
import SidePanel from './SidePanel'
import '@/styles/globals.css'
import { ErrorBoundary } from '../components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SidePanel />
    </ErrorBoundary>
  </React.StrictMode>
)
