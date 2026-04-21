import { useState, useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { NotesTab } from './components/NotesTab'
import { WikiTab } from './components/WikiTab'
import { SearchTab } from './components/SearchTab'
import { SettingsPanel } from './components/SettingsPanel'
import { OnboardingModal } from './components/OnboardingModal'
import { UndoToast } from './components/UndoToast'

type Tab = 'notes' | 'wiki' | 'search'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    window.api.onboarding.getStatus().then(({ done }) => {
      if (!done) setShowOnboarding(true)
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => setShowSettings(true)}
      />
      <div className="flex-1 overflow-hidden">
        <div className="h-full" style={{ display: activeTab === 'notes' ? 'block' : 'none' }}>
          <NotesTab />
        </div>
        <div className="h-full" style={{ display: activeTab === 'wiki' ? 'block' : 'none' }}>
          <WikiTab />
        </div>
        <div className="h-full" style={{ display: activeTab === 'search' ? 'block' : 'none' }}>
          <SearchTab />
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showOnboarding && <OnboardingModal onDismiss={() => setShowOnboarding(false)} />}
      <UndoToast />
    </div>
  )
}
