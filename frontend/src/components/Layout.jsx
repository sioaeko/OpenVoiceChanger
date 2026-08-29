import React from 'react';

const TABS = [
  {
    id: 'studio',
    label: 'Studio',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'models',
    label: 'Models',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: 'converter',
    label: 'Converter',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
];

export default function Layout({ children, tab, onTabChange, statusSlot = null, headerActions = null }) {
  return (
    <div className="min-h-screen text-fg">
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-header backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-control-hover">
                <svg className="h-4 w-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-normal text-fg">
                  OpenVoiceChanger
                </p>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-fg-subtle">
                  Realtime Voice Studio
                </p>
              </div>
            </div>

            {/* The trough stays dark so the raised selected pill reads clearly
                against it — lightening the container here would flatten the
                selected/unselected difference. */}
            <nav className="order-3 flex w-full items-center gap-0.5 rounded-md border border-[color:var(--frost-border)] bg-sunken p-0.5 shadow-[var(--frost-shadow)] sm:order-none sm:w-auto">
              {TABS.map((item) => {
                const selected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange?.(item.id)}
                    aria-current={selected ? 'page' : undefined}
                    data-selected={selected}
                    /* Shared `border` gives every pill the same 1px box so
                       switching tabs never shifts widths; the colour comes from
                       .frost-control when selected and is transparent when not.
                       Keeping `rounded` (4px) here overrides the 8px token on
                       purpose — this pill nests inside a 6px trough. */
                    className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded border px-1 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] sm:flex-initial sm:gap-2 sm:px-4 ${
                      selected
                        ? 'frost-control text-fg'
                        : 'border-transparent text-fg-subtle transition-colors duration-150 ease-out hover:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)]'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </nav>

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
          <p className="mx-auto w-full max-w-[1560px] px-4 text-[10px] uppercase tracking-[0.18em] text-fg-faint sm:px-6 lg:px-8">
            Local realtime RVC · ONNX · DSP voice studio
          </p>
        </footer>
      </div>
    </div>
  );
}
