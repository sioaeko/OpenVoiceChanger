import React, { useEffect, useRef } from 'react';

// Real-time canvas visualizer: flat single-color output spectrum with the
// input spectrum as a dim layer behind it, plus a quiet idle animation.
export default function Visualizer({ getAnalysers, isRunning }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const idlePhaseRef = useRef(0);
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const inputData = new Uint8Array(1024);
    const outputData = new Uint8Array(1024);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const { input, output } = getAnalysers?.() || {};
      const running = isRunningRef.current && (input || output);

      const barCount = Math.max(24, Math.min(96, Math.floor(width / 12)));
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;
      const usableBins = 0.72; // ignore the near-empty top of the spectrum

      if (running) {
        if (input) input.getByteFrequencyData(inputData.subarray(0, input.frequencyBinCount));
        if (output) output.getByteFrequencyData(outputData.subarray(0, output.frequencyBinCount));
        const binCount = (output || input).frequencyBinCount;

        for (let i = 0; i < barCount; i++) {
          // Log-ish frequency mapping so voice range dominates the display.
          const t = i / (barCount - 1);
          const bin = Math.min(
            binCount - 1,
            Math.floor((Math.pow(t, 1.6)) * binCount * usableBins)
          );
          const x = i * (barWidth + gap);

          if (input) {
            const vIn = inputData[bin] / 255;
            const hIn = Math.max(1, vIn * height * 0.92);
            ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.fillRect(x, height - hIn, barWidth, hIn);
          }

          if (output) {
            const vOut = outputData[bin] / 255;
            const hOut = Math.max(1, vOut * height * 0.92);
            ctx.fillStyle = 'rgba(52, 211, 153, 0.82)';
            ctx.fillRect(x, height - hOut, barWidth, hOut);
          }
        }
      } else {
        // Idle: slow, dim noise floor.
        idlePhaseRef.current += 0.012;
        const phase = idlePhaseRef.current;
        for (let i = 0; i < barCount; i++) {
          const t = i / (barCount - 1);
          const wave =
            0.08 +
            0.05 * Math.sin(t * 7 + phase) * Math.sin(t * 3 - phase * 0.7) +
            0.03 * Math.sin(t * 13 - phase * 1.4);
          const h = Math.max(1, Math.abs(wave) * height);
          const x = i * (barWidth + gap);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.fillRect(x, height - h, barWidth, h);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [getAnalysers]);

  return (
    <section className="panel relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="panel-kicker">Spectrum</p>
          <h2 className="panel-title">Live signal</h2>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-zinc-500/50" />
            Input
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-emerald-400/80" />
            Output
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} className="mt-4 h-44 w-full sm:h-52" />
      {!isRunning && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[38%] text-center text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
          Start routing to see the live spectrum
        </p>
      )}
    </section>
  );
}
