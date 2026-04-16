type Tab = 'notes' | 'wiki' | 'search'

interface TabBarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onSettingsClick: () => void
}

export function TabBar({ activeTab, onTabChange, onSettingsClick }: TabBarProps) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'notes', label: 'Notes' },
    { id: 'wiki', label: 'Wiki' },
    { id: 'search', label: 'Patterns' },
  ]

  return (
    <div className="flex items-center border-b border-white/10 bg-black/20 shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={[
            'px-5 py-3 text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'text-white border-b-2 border-blue-400 -mb-px'
              : 'text-gray-400 hover:text-gray-200',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
      {/* Push gear to the right */}
      <div className="ml-auto">
        <button
          onClick={onSettingsClick}
          className="px-4 py-3 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Open settings"
          title="Settings"
        >
          &#9881;
        </button>
      </div>
    </div>
  )
}
