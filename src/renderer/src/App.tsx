import { useState } from 'react'
import { TabBar } from './components/TabBar'
import { NotesTab } from './components/NotesTab'
import { WikiTab } from './components/WikiTab'
import { SearchTab } from './components/SearchTab'
import { SettingsPanel } from './components/SettingsPanel'

type Tab = 'notes' | 'wiki' | 'search'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => setShowSettings(true)}
      />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'wiki' && <WikiTab />}
        {activeTab === 'search' && <SearchTab />}
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
