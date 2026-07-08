import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import Scene3D from './views/Scene3D'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Scene3D />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
