import React, { useRef } from 'react';
import { Boxes, FileDown, Mic2 } from 'lucide-react';

// Ids match lib/navigation TAB_IDS; the matching panels in App carry
// id="panel-<id>" and aria-labelledby="tab-<id>".
const TABS = [
  {
    id: 'studio',
    label: 'Studio',
    Icon: Mic2,
  },
  {
    id: 'models',
    label: 'Models',
    Icon: Boxes,
  },
  {
    id: 'converter',
    label: 'Converter',
    Icon: FileDown,
  },
];

/**
 * Top-level view switcher.
 *
 * Marked up as a tablist (not a nav) because the three views are panels of one
 * document rather than separate pages: assistive tech announces "tab 2 of 3,
 * selected", and arrow keys move between them while only the selected tab
 * sits in the Tab order, as the WAI-ARIA pattern prescribes.
 */
function TabList({ tab, onTabChange }) {
  const listRef = useRef(null);

  const handleKeyDown = (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const currentIndex = Math.max(0, TABS.findIndex(({ id }) => id === tab));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TABS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    const nextId = TABS[nextIndex].id;

    onTabChange?.(nextId);
    listRef.current?.querySelector(`[data-tab="${nextId}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Workspace"
      onKeyDown={handleKeyDown}
      className="order-3 flex w-full items-center gap-1 rounded-lg border border-[color:var(--frost-border)] bg-sunken p-1 sm:order-none sm:w-auto"
    >
      {TABS.map((item) => {
        const selected = tab === item.id;
        const Icon = item.Icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            data-tab={item.id}
            data-selected={selected}
            onClick={() => onTabChange?.(item.id)}
            className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium sm:flex-initial sm:gap-2 sm:px-4 ${
              selected
                ? 'frost-control text-fg'
                : 'border-transparent text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)]'
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Layout({ children, tab, onTabChange, statusSlot = null, headerActions = null }) {
  return (
    <div className="min-h-screen text-fg">
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-header backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-control-hover">
                <Mic2 className="h-4 w-4 text-fg-secondary" aria-hidden="true" />
              </div>
              <div className="leading-tight">
                <h1 className="text-sm font-semibold tracking-normal text-fg">
                  OpenVoiceChanger
                </h1>
                <p className="text-[11px] font-medium text-fg-subtle">
                  Realtime Voice Studio
                </p>
              </div>
            </div>

            <TabList tab={tab} onTabChange={onTabChange} />

            <div className="ml-auto flex items-center gap-3">
              {statusSlot}
              {headerActions}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>

        <footer className="border-t border-line py-3">
          <p className="mx-auto w-full max-w-[1560px] px-4 text-[11px] text-fg-faint sm:px-6 lg:px-8">
            Local realtime RVC · ONNX · DSP voice studio
          </p>
        </footer>
      </div>
    </div>
  );
}
