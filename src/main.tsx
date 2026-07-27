import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Scene3D from './views/Scene3D'
import Embed from './views/embed'
import './styles/global.css'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Scene3D />} />
        <Route path="/embed" element={<Embed />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
