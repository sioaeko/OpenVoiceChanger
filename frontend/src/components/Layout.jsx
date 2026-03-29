import React from 'react';

export default function Layout({ children, headerActions = null }) {
  return (
    <div className="min-h-screen text-zinc-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(91,214,255,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(248,191,120,0.12),transparent_24%),linear-gradient(180deg,#08090d_0%,#0f131a_45%,#0a0d12_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
            maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.15))',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="min-w-0">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
                  Local RVC Console
                </p>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.06em] text-zinc-50 sm:text-[2.8rem]">
                    OpenVoiceChanger
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    Route one microphone through a live model, keep the monitor path visible,
                    and tune pitch without leaving the workspace.
                  </p>
                </div>
              </div>
            </div>

            {headerActions ? (
              <div className="flex flex-shrink-0 items-center justify-start lg:justify-end">
                {headerActions}
              </div>
            ) : null}
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>

        <footer className="border-t border-white/10 py-4">
          <p className="mx-auto w-full max-w-[1480px] px-4 text-xs uppercase tracking-[0.26em] text-zinc-600 sm:px-6 lg:px-8">
            Monitoring surface for local real-time RVC streaming
          </p>
        </footer>
      </div>
    </div>
  );
}
