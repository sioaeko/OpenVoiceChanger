import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Star } from 'lucide-react';
import { fetchGitHubStarState, starGitHubRepository } from '../lib/api';

const GITHUB_REPOSITORY_URL = 'https://github.com/sioaeko/OpenVoiceChanger';
const CONTROL_CLASS = 'frost-control group inline-flex h-8 w-[38px] items-center justify-center gap-2 px-2.5 text-fg-muted sm:w-[148px]';

export default function GitHubStarButton() {
  const [mode, setMode] = useState('checking');
  const [fallbackAfterError, setFallbackAfterError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchGitHubStarState()
      .then((state) => {
        if (!active) return;
        if (!state?.available) {
          setMode('fallback');
          return;
        }
        setMode(state.starred ? 'starred' : 'ready');
      })
      .catch(() => {
        if (active) setMode('fallback');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleStar = useCallback(async () => {
    if (mode !== 'ready') return;
    setMode('starring');
    try {
      const state = await starGitHubRepository();
      if (!state?.starred) throw new Error('GitHub did not confirm the star');
      setMode('starred');
    } catch {
      setFallbackAfterError(true);
      setMode('fallback');
    }
  }, [mode]);

  if (mode === 'fallback' || mode === 'starred') {
    const starred = mode === 'starred';
    const label = starred ? 'Starred' : fallbackAfterError ? 'Open GitHub' : 'Star on GitHub';
    const description = starred
      ? 'Open the starred OpenVoiceChanger repository on GitHub in a new tab'
      : fallbackAfterError
        ? 'GitHub CLI could not add the star; open the repository in a new tab'
        : 'Open the OpenVoiceChanger GitHub repository in a new tab to star it';

    return (
      <a
        href={GITHUB_REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${CONTROL_CLASS} hover:text-fg`}
        data-selected={starred ? 'true' : undefined}
        title={description}
        aria-label={description}
      >
        <Star
          className={`h-4 w-4 transition-colors ${starred ? 'fill-current' : 'group-hover:fill-current'}`}
          aria-hidden="true"
        />
        <span className="hidden whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] sm:inline">
          {label}
        </span>
      </a>
    );
  }

  const busy = mode === 'checking' || mode === 'starring';
  const label = mode === 'starring' ? 'Starring...' : 'Star on GitHub';
  const description = mode === 'checking'
    ? 'Checking whether OpenVoiceChanger is already starred'
    : mode === 'starring'
      ? 'Adding a GitHub star with the active GitHub CLI account'
      : 'Star OpenVoiceChanger with the active GitHub CLI account';

  return (
    <button
      type="button"
      onClick={handleStar}
      disabled={busy}
      className={`${CONTROL_CLASS} hover:text-fg disabled:cursor-wait disabled:opacity-65`}
      title={description}
      aria-label={description}
      aria-busy={busy}
    >
      {busy ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Star className="h-4 w-4 transition-colors group-hover:fill-current" aria-hidden="true" />
      )}
      <span className="hidden whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] sm:inline">
        {label}
      </span>
    </button>
  );
}
