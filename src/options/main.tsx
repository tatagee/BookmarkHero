import React from 'react'
import ReactDOM from 'react-dom/client'
import Options from './Options'
import '@/styles/globals.css'
import { ErrorBoundary } from '../components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Options />
    </ErrorBoundary>
  </React.StrictMode>
)
