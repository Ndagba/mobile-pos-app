'use client';

import { useEffect, useRef } from 'react';

/**
 * Decorative 3D brand scene for the login page (login handoff §"3D scene").
 * Pure CSS 3D — no three.js. A single requestAnimationFrame loop writes the
 * stage + card transforms directly through refs (no React re-renders): mouse
 * parallax (lerped) plus a per-card float. Honors prefers-reduced-motion by
 * keeping the static base transforms and skipping the loop. The whole scene is
 * aria-hidden; the receipt/product data is hard-coded and decorative.
 */
export function AuthScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;
    if (!scene || !stage) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Pointer target (−1..1) and the lerped value we actually apply.
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;

    const onMove = (e: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };

    const floats = Array.from(stage.querySelectorAll<HTMLElement>('[data-float]'));

    if (reduced) {
      // Apply the static base pose once and stop.
      stage.style.transform = 'rotateX(18deg) rotateY(-24deg)';
      floats.forEach((n) => {
        n.style.transform = n.dataset.base ?? '';
      });
      return;
    }

    window.addEventListener('mousemove', onMove);
    const t0 = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const t = (now - t0) / 1000;
      tx += (mx - tx) * 0.06;
      ty += (my - ty) * 0.06;
      const ry = -24 + tx * 14 + Math.sin(t * 0.4) * 4;
      const rx = 18 - ty * 10 + Math.cos(t * 0.35) * 2;
      stage.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      floats.forEach((n) => {
        const i = Number(n.dataset.float);
        const dy = Math.sin(t * 1.1 + i * 1.3) * 8;
        n.style.transform = `${n.dataset.base} translateY(${dy}px)`;
      });
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  // 14 extruded layers behind the logo tile (oklch 0.42 → 0.22, chroma .19, hue 285).
  const layers = Array.from({ length: 14 }, (_, i) => {
    const k = i / 13;
    const l = 0.42 - k * 0.2;
    return { z: -(i + 1) * 2, bg: `oklch(${l} 0.19 285)` };
  });

  const cardShadow = '0 30px 60px rgba(5,3,30,.45)';

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden px-10 py-9 lg:flex"
      style={{
        background:
          'radial-gradient(120% 90% at 30% 20%, #2A1F7A 0%, #140F3D 55%, #0B0824 100%)'
      }}
    >
      {/* Logo row */}
      <div className="relative z-10 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jaypos-icon.svg" alt="" className="block h-9 w-9 rounded-[10px]" />
        <div className="text-xl font-extrabold tracking-[-0.04em] text-white">
          Jay<span className="text-[#A99BFF]">POS</span>
        </div>
      </div>

      {/* 3D stage */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: '1400px', perspectiveOrigin: '50% 45%' }}
      >
        <div
          ref={stageRef}
          className="relative h-[420px] w-[520px]"
          style={{ transformStyle: 'preserve-3d', transform: 'rotateX(18deg) rotateY(-24deg)' }}
        >
          {/* Floor grid */}
          <div
            className="absolute"
            style={{
              left: -140,
              top: 250,
              width: 800,
              height: 800,
              transform: 'rotateX(90deg) translateZ(-60px)',
              transformOrigin: '50% 0',
              backgroundImage:
                'linear-gradient(rgba(169,155,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(169,155,255,.16) 1px,transparent 1px)',
              backgroundSize: '40px 40px',
              WebkitMaskImage: 'radial-gradient(closest-side,#000 30%,transparent 100%)',
              maskImage: 'radial-gradient(closest-side,#000 30%,transparent 100%)'
            }}
          />

          {/* Extruded logo tile */}
          <div
            data-float="0"
            data-base="translate3d(170px,90px,40px)"
            className="absolute left-0 top-0 h-[180px] w-[180px]"
            style={{ transformStyle: 'preserve-3d', transform: 'translate3d(170px,90px,40px)' }}
          >
            {layers.map((l, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-[50px]"
                style={{ background: l.bg, transform: `translateZ(${l.z}px)` }}
              />
            ))}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jaypos-icon.svg"
              alt=""
              className="absolute inset-0 h-[180px] w-[180px] rounded-[50px]"
              style={{ transform: 'translateZ(2px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }}
            />
          </div>

          {/* Receipt card */}
          <div
            data-float="1"
            data-base="translate3d(330px,10px,120px) rotateZ(4deg)"
            className="absolute left-0 top-0 w-[200px] rounded-[14px] bg-white px-4 pb-3.5 pt-4"
            style={{ boxShadow: cardShadow, transform: 'translate3d(330px,10px,120px) rotateZ(4deg)' }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A98AB]">Receipt</span>
              <span className="font-mono text-[11px] text-[#77758A]">#10482</span>
            </div>
            <div className="grid gap-1.5 text-[12px] text-[#4A4858]">
              <div className="flex justify-between"><span>Peak Milk 400g ×2</span><span className="font-mono">₦7,600</span></div>
              <div className="flex justify-between"><span>Golden Penny Rice</span><span className="font-mono">₦38,500</span></div>
              <div className="flex justify-between"><span>VAT 7.5%</span><span className="font-mono">₦3,458</span></div>
            </div>
            <div className="my-2 border-t border-dashed border-[#E1DFEA]" />
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold text-[#0E0E10]">Total</span>
              <span className="font-mono text-[16px] font-semibold text-[#0E0E10]">₦49,558</span>
            </div>
          </div>

          {/* Product card */}
          <div
            data-float="2"
            data-base="translate3d(10px,40px,90px) rotateZ(-6deg)"
            className="absolute left-0 top-0 w-[150px] overflow-hidden rounded-[14px] bg-white"
            style={{ boxShadow: cardShadow, transform: 'translate3d(10px,40px,90px) rotateZ(-6deg)' }}
          >
            <div className="flex h-24 items-center justify-center bg-[#F1EEFF] text-[34px] font-extrabold tracking-[-0.04em] text-[#6E56F7]">
              Pk
            </div>
            <div className="px-3 pb-3 pt-2.5">
              <div className="text-[12.5px] font-semibold text-[#1D1B26]">Peak Milk 400g</div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-[13px] font-semibold text-[#0E0E10]">₦3,800</span>
                <span className="rounded-full bg-[#E6F5EE] px-1.5 py-0.5 text-[10.5px] font-bold text-[#11734F]">42</span>
              </div>
            </div>
          </div>

          {/* Paid pill */}
          <div
            data-float="3"
            data-base="translate3d(250px,300px,170px)"
            className="absolute left-0 top-0 flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white py-2.5 pl-2.5 pr-3.5"
            style={{ boxShadow: '0 24px 50px rgba(5,3,30,.5)', transform: 'translate3d(250px,300px,170px)' }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#11734F] text-[15px] font-extrabold text-white">✓</span>
            <span className="grid gap-px">
              <span className="text-[11px] text-[#77758A]">Paid · Split</span>
              <span className="font-mono text-[13px] font-semibold text-[#0E0E10]">₦49,558</span>
            </span>
          </div>

          {/* Sync badge (glass) */}
          <div
            data-float="4"
            data-base="translate3d(40px,280px,60px)"
            className="absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-2"
            style={{
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.22)',
              backdropFilter: 'blur(6px)',
              transform: 'translate3d(40px,280px,60px)'
            }}
          >
            <span className="h-2 w-2 rounded-full bg-[#3DDC97]" />
            <span className="text-[12px] font-semibold text-white">Synced · Lekki branch</span>
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-[420px]">
        <div className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">
          Sell faster. Count smarter. Close the day in minutes.
        </div>
        <div className="mt-2.5 text-[14px] leading-[1.55] text-[#C9C2F5]">
          Point of sale, inventory and reports for every branch. Keeps selling when the internet drops.
        </div>
      </div>
    </div>
  );
}
