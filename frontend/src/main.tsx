import '@alemonjs/react-ui/style.css'
import '@alemonjs/react-ui/theme'
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './pages/App'
import './styles.css'
import './theme-overrides.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
