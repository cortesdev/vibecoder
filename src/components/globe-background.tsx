"use client";

// ---------------------------------------------------------------------------
// GlobeBackground.tsx — Three.js dotted globe with animated flight arcs and
// travelling pulses, used as a decorative layer behind the landing hero.
//
// Ported from bailecria's GlobeHero with the brand-specific São Paulo routes
// generalized to neutral tech hubs and the accent read from Vibecoder's
// --accent token. Same raw-Three pattern: alpha renderer, DPR cap, full GL
// cleanup on unmount. IntersectionObserver pauses the RAF when it scrolls
// offscreen; prefers-reduced-motion renders one static frame; no WebGL →
// renders nothing (hero copy stands alone).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import * as THREE from "three";

const RADIUS = 1;
const POINT_COUNT = 4200;
const SPIN_SPEED = 0.06; // rad/s
const PULSE_SPEED = 0.25; // arc traversals per second
const INITIAL_SPIN_Y = -1.35; // initial spin: both coasts visible

// Neutral world hubs the globe actually connects, not São Paulo branding.
const CITIES: { name: string; lat: number; lon: number; origin?: boolean }[] = [
  { name: "San Francisco", lat: 37.77, lon: -122.42, origin: true },
  { name: "Berlin", lat: 52.52, lon: 13.4 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "Singapore", lat: 1.35, lon: 103.82 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Bangalore", lat: 12.97, lon: 77.59 },
];

function latLonToVec3(lat: number, lon: number, radius = RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// Resolve the accent from the CSS variable so the globe follows the theme.
function resolveAccent(): { hex: number; css: string } {
  const fallback = { hex: 0xe8483f, css: "#e8483f" };
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const hex = raw.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return { hex: parseInt(hex, 16), css: `#${hex}` };
  }
  return fallback;
}

// Soft radial glow, reused for city markers and travelling arc pulses.
function makeGlowTexture(accentCss: string): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.3, accentCss);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeArc(from: THREE.Vector3, to: THREE.Vector3): THREE.QuadraticBezierCurve3 {
  const dist = from.distanceTo(to);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.normalize().multiplyScalar(RADIUS + dist * 0.4 + 0.06);
  return new THREE.QuadraticBezierCurve3(from, mid, to);
}

export default function GlobeBackground({
  className,
}: {
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const accent = resolveAccent();
    const accentColor = new THREE.Color(accent.hex);
    const glowTexture = makeGlowTexture(accent.css);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      // No WebGL (old browser, blocked GPU) — the hero text stands on its own.
      return;
    }

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.z = 5;

    // This can render into a huge drawing buffer (the hero mounts a
    // viewport-sized box). Cap harder once the canvas gets that large — the
    // extra sharpness isn't visible on a soft glow.
    const dprFor = (w: number) => Math.min(window.devicePixelRatio, w > 1400 ? 1.5 : 2);
    renderer.setSize(width, height);
    renderer.setPixelRatio(dprFor(width));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    mount.appendChild(canvas);

    const group = new THREE.Group();
    group.rotation.y = INITIAL_SPIN_Y;
    scene.add(group);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // ── Dotted sphere ──────────────────────────────────────────────────────
    // Fibonacci distribution: even coverage without latitude clustering. A
    // touch of radius jitter keeps it from reading as a perfect shell. Dots
    // render at 0.6 opacity — 40% transparent, per the hero spec.
    const positions = new Float32Array(POINT_COUNT * 3);
    const colors = new Float32Array(POINT_COUNT * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < POINT_COUNT; i++) {
      const y = 1 - (i / (POINT_COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const t = goldenAngle * i;
      const jitter = RADIUS * (0.995 + Math.random() * 0.008);
      positions[i * 3] = Math.cos(t) * r * jitter;
      positions[i * 3 + 1] = y * jitter;
      positions[i * 3 + 2] = Math.sin(t) * r * jitter;
      const c = accentColor.clone().lerp(white, Math.random() * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const dotGeometry = track(new THREE.BufferGeometry());
    dotGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dotGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const dotMaterial = track(
      new THREE.PointsMaterial({
        size: 0.016,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    group.add(new THREE.Points(dotGeometry, dotMaterial));

    // ── Atmosphere ─────────────────────────────────────────────────────────
    // One oversized glow sprite behind the globe; cheaper than a Fresnel
    // shader and enough to lift the silhouette off the page background.
    const atmosphereMaterial = track(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: accentColor,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const atmosphere = new THREE.Sprite(atmosphereMaterial);
    atmosphere.scale.setScalar(3.4);
    atmosphere.position.z = -0.6;
    group.add(atmosphere);

    // ── Marker dots ────────────────────────────────────────────────────────
    const origin = CITIES.find((c) => c.origin) ?? CITIES[0];
    for (const city of CITIES) {
      const material = track(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: white,
          transparent: true,
          opacity: city.origin ? 0.95 : 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(latLonToVec3(city.lat, city.lon));
      sprite.scale.setScalar(city.origin ? 0.11 : 0.08);
      group.add(sprite);
    }

    // ── Arcs + travelling pulses ───────────────────────────────────────────
    const originVec = latLonToVec3(origin.lat, origin.lon);
    type Pulse = {
      curve: THREE.QuadraticBezierCurve3;
      sprite: THREE.Sprite;
      material: THREE.SpriteMaterial;
      offset: number;
    };
    const pulses: Pulse[] = [];

    CITIES.filter((c) => !c.origin).forEach((city, index) => {
      const curve = makeArc(originVec, latLonToVec3(city.lat, city.lon));

      const lineGeometry = track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(72)));
      const lineMaterial = track(
        new THREE.LineBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(new THREE.Line(lineGeometry, lineMaterial));

      const pulseMaterial = track(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: accentColor,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const sprite = new THREE.Sprite(pulseMaterial);
      sprite.scale.setScalar(0.09);
      group.add(sprite);
      pulses.push({ curve, sprite, material: pulseMaterial, offset: index / 6 });
    });

    // ── Interaction / lifecycle ────────────────────────────────────────────
    const pointer = { x: 0, y: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    const clock = new THREE.Clock();
    let rafId = 0;
    let running = false;

    const renderFrame = (elapsed: number) => {
      group.rotation.y = INITIAL_SPIN_Y + elapsed * SPIN_SPEED;
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pointer.y * 0.16, 0.05);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -0.1 + pointer.x * 0.06, 0.05);

      for (const pulse of pulses) {
        const t = (elapsed * PULSE_SPEED + pulse.offset) % 1;
        pulse.sprite.position.copy(pulse.curve.getPoint(t));
        pulse.material.opacity = Math.sin(t * Math.PI) * 0.9;
      }

      renderer.render(scene, camera);
    };

    const loop = () => {
      renderFrame(clock.getElapsedTime());
      rafId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || prefersReducedMotion) return;
      running = true;
      rafId = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    if (prefersReducedMotion) {
      renderFrame(0);
    } else {
      start();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    observer.observe(mount);

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(dprFor(w));
      renderer.setSize(w, h);
      if (!running && prefersReducedMotion) renderFrame(0);
    });
    resizeObserver.observe(mount);

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      for (const item of disposables) item.dispose();
      glowTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}