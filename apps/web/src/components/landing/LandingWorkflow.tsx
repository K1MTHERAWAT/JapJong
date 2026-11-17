'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WORKFLOW_STEPS } from './landing-config';
import { ScrollReveal } from './ScrollReveal';

/**
 * 4-step approval workflow section with an animated horizontal connecting line.
 */
export function LandingWorkflow() {
  const lineRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDrawn(true);
      return;
    }

    const el = lineRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDrawn(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="workflow" className="px-4 py-12 sm:px-6 md:py-16 relative">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal className="text-center max-w-xl mx-auto mb-10">
          <div className="text-caption font-semibold text-brand-ink uppercase tracking-wider">
            Workflow Automation
          </div>
          <h2 className="text-title md:text-display font-bold text-ink mt-1">
            4 ขั้นตอนสู่อนุมัติไวแบบไร้กระดาษ
          </h2>
        </ScrollReveal>

        <div className="relative">
          {/* Animated Connecting Line (Desktop) */}
          <div
            ref={lineRef}
            aria-hidden="true"
            className="hidden lg:block absolute top-8 left-12 right-12 h-0.5 bg-line z-0 overflow-hidden rounded-full"
          >
            <div
              className="h-full bg-brand transition-all duration-1000 ease-out"
              style={{ width: drawn ? '100%' : '0%' }}
            />
          </div>

          <div className="relative z-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {WORKFLOW_STEPS.map((item) => (
              <ScrollReveal key={item.step} delayMs={item.delayMs}>
                <div className="landing-sleek-card h-full rounded-card bg-surface border border-line p-5 space-y-2.5">
                  <span className="inline-flex w-9 h-9 rounded-full bg-brand text-white text-caption font-bold items-center justify-center shadow-sm">
                    {item.step}
                  </span>
                  <h3 className="text-body font-bold text-ink">{item.title}</h3>
                  <p className="text-caption text-ink-mute leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
