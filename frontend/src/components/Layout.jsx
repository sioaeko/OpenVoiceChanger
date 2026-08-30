import React from 'react';
import { Boxes, FileDown, Mic2 } from 'lucide-react';

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
                const Icon = item.Icon;
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
                    <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
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
