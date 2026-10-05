import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Roadmap from './Roadmap.jsx'
import Console from './Console.jsx'
import DockConsole from './DockConsole.jsx'
import TakeoverConsole from './TakeoverConsole.jsx'
import ConvoyConsole from './ConvoyConsole.jsx'
import SentinelConsole from './SentinelConsole.jsx'
import SaboteurConsole from './SaboteurConsole.jsx'

// Pick the scenario-specific console.
function ScenarioRouter() {
  const { id } = useParams()
  if (String(id) === '2') return <DockConsole />
  if (String(id) === '3') return <TakeoverConsole />
  if (String(id) === '4') return <ConvoyConsole />
  if (String(id) === '5') return <SentinelConsole />
  if (String(id) === '6') return <SaboteurConsole />
  return <Console />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Roadmap />} />
        <Route path="/scenario/:id" element={<ScenarioRouter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
