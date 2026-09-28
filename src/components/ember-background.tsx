"use client";

// ---------------------------------------------------------------------------
// ember-background.tsx — fixed red ambience layer for the landing page.
//
// Two pieces, both procedural and pointer-transparent:
//   1. A full-viewport Three.js ribbon field (ported from the Relay landing's
//      light-rays, re-paletted to Vibecoder's --accent with no blue share).
//   2. The Vibecoder logo as a plain 2D div (NOT a 3D object, no perspective
//      angle): it expands and dissolves as the visitor scrolls, like a slow
//      zoom straight through the mark.
//
// Behavior: scroll-driven via the same lerped progress the rays use; pauses
// when the tab hides; renders one static frame under prefers-reduced-motion;
// hidden entirely in the light theme (screen-blend red on paper blows out).
// No WebGL -> renders nothing, the page stands on its own.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import Image from "next/image";
import * as THREE from "three";
import { pageProgress } from "./landing-motion";

const SCENE = {
  rays: 220,
  raysMobile: 110,
  segments: 48,
  travel: 520,
  intensity: 0.7,
  glowWidth: 0.55,
  coreWidth: 0.07,
};

const RAY_VERT = `
attribute float aT; attribute float aSide; attribute vec4 aS1; attribute vec4 aS2;
uniform float uWidth;
varying float vT; varying float vSide; varying float vDepth; varying vec4 vS;
vec3 pathAt(float t){
  float z = aS1.x - t * aS1.y;
  float dir = aS2.y > 3.14159 ? 1.0 : -1.0;
  float ang = aS1.z + dir * t * 1.6 + sin(t * aS2.z * 6.2831 + aS2.y) * 0.7;
  float rad = aS1.w * (1.0 + 0.45 * sin(t * 3.5 + aS2.y * 2.0));
  return vec3(cos(ang) * rad, sin(ang) * rad * 0.7, z);
}
void main(){
  vec4 a = modelViewMatrix * vec4(pathAt(aT - 0.01), 1.0);
  vec4 b = modelViewMatrix * vec4(pathAt(aT + 0.01), 1.0);
  vec4 mv = modelViewMatrix * vec4(pathAt(aT), 1.0);
  vec2 d = b.xy / max(0.001, -b.z) - a.xy / max(0.001, -a.z);
  float l = length(d);
  vec2 n = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
  mv.xy += n * aSide * uWidth * aS2.x;
  vT = aT; vSide = aSide; vDepth = -mv.z;
  vS = vec4(fract(aS2.w * 13.0), aS2.y, fract(aS2.w * 7.0), aS2.w);
  gl_Position = projectionMatrix * mv;
}`;

const RAY_FRAG = `
precision highp float;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
uniform float uTime; uniform float uAlpha; uniform float uBoost; uniform float uCore; uniform float uBlue;
varying float vT; varying float vSide; varying float vDepth; varying vec4 vS;
void main(){
  float edge = 1.0 - abs(vSide);
  float core = pow(edge, uCore);
  float head = smoothstep(0.0, 0.12, vT) * smoothstep(1.0, 0.55, vT);
  float flow = 0.45 + 0.55 * pow(0.5 + 0.5 * sin((vT * 3.0 - uTime * (0.25 + vS.x * 0.4)) * 6.2831 + vS.y * 6.2831), 2.0);
  float depth = smoothstep(0.8, 4.0, vDepth) * (1.0 - smoothstep(70.0, 150.0, vDepth));
  vec3 col = vS.w < uBlue ? uC : mix(uA, uB, vS.z);
  col = mix(col, vec3(1.0), core * core * 0.35);
  float a = core * head * flow * depth * uAlpha * (0.35 + uBoost);
  gl_FragColor = vec4(col * a, a);
}`;

function resolveAccent(): { deep: number; bright: number; css: string } {
  const fallback = { deep: 0xe8483f, bright: 0xff9d97, css: "#e8483f" };
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const hex = raw.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const deep = parseInt(hex, 16);
    const c = new THREE.Color(deep);
    const bright = c.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex();
    return { deep, bright, css: `#${hex}` };
  }
  return fallback;
}

function glowTexture(accentCss: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  if (!x) return tex;
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.3, accentCss);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  tex.needsUpdate = true;
  return tex;
}

export default function EmberBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const logo = logoRef.current;
    if (!host) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const accent = resolveAccent();
    const glowTex = glowTexture(accent.css);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

    const mobile = window.innerWidth < 640;
    const N = mobile ? SCENE.raysMobile : SCENE.rays;
    const S = SCENE.segments;
    const V = N * (S + 1) * 2;
    const aT = new Float32Array(V);
    const aSide = new Float32Array(V);
    const aS1 = new Float32Array(V * 4);
    const aS2 = new Float32Array(V * 4);
    const index = new (V > 65535 ? Uint32Array : Uint16Array)(N * S * 6);
    let ii = 0;
    for (let i = 0; i < N; i++) {
      const z0 = 12 - Math.random() * (SCENE.travel + 90);
      const len = 50 + Math.random() * 110;
      const theta = Math.random() * Math.PI * 2;
      const rad = 1.2 + Math.pow(Math.random(), 1.6) * 16;
      const s1 = [z0, len, theta, rad];
      const s2 = [
        0.5 + Math.random() * 1.6,
        Math.random() * Math.PI * 2,
        0.35 + Math.random() * 0.9,
        Math.random(),
      ];
      for (let j = 0; j <= S; j++) {
        for (let side = 0; side < 2; side++) {
          const k = (i * (S + 1) + j) * 2 + side;
          aT[k] = j / S;
          aSide[k] = side ? 1 : -1;
          aS1.set(s1, k * 4);
          aS2.set(s2, k * 4);
        }
        if (j < S) {
          const a = (i * (S + 1) + j) * 2;
          index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
          ii += 6;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
    geo.setAttribute("aS1", new THREE.BufferAttribute(aS1, 4));
    geo.setAttribute("aS2", new THREE.BufferAttribute(aS2, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));

    const mats: THREE.ShaderMaterial[] = [];
    const makeRays = (width: number, alpha: number, core: number) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: RAY_VERT,
        fragmentShader: RAY_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        uniforms: {
          uWidth: { value: width },
          uAlpha: { value: alpha * SCENE.intensity },
          uCore: { value: core },
          uBoost: { value: 0 },
          uTime: { value: 0 },
          uA: { value: new THREE.Color(accent.deep) },
          uB: { value: new THREE.Color(accent.bright) },
          uC: { value: new THREE.Color(accent.deep) },
          uBlue: { value: 0 },
        },
      });
      mats.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      scene.add(mesh);
    };
    makeRays(SCENE.glowWidth, 0.16, 0.8);
    makeRays(SCENE.coreWidth, 1.0, 1.6);

    const clock = new THREE.Clock();
    let p = 0;
    let ps = 0;
    let prev = 0;
    let vel = 0;
    let raf = 0;
    let running = false;

    const readScroll = () => {
      p = pageProgress(
        window.scrollY || document.documentElement.scrollTop,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );
    };

    // The 2D logo zoom: crisp mark up top, expanding red aura on the way down.
    const paintLogo = (s: number) => {
      if (!logo) return;
      const scale = 0.55 + s * 4.2;
      const opacity = 0.9 * (1 - s * 0.88);
      logo.style.transform = `translateY(${(-s * 70).toFixed(1)}px) scale(${scale.toFixed(3)})`;
      logo.style.opacity = opacity.toFixed(3);
      logo.style.filter = s > 0.02 ? `blur(${(s * 10).toFixed(1)}px)` : "";
    };

    const draw = (t: number) => {
      camera.position.set(
        Math.sin(ps * 10) * 2.2,
        Math.cos(ps * 7) * 1.2,
        -ps * SCENE.travel,
      );
      camera.rotation.set(0, Math.cos(ps * 10) * 0.02, Math.sin(ps * 8) * 0.06);
      for (const m of mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uBoost.value = vel * 1.1;
      }
      renderer.render(scene, camera);
      paintLogo(ps);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      ps += (p - ps) * 0.075;
      vel += (Math.min(1, Math.abs(ps - prev) * 260) - vel) * 0.08;
      prev = ps;
      draw(clock.getElapsedTime());
    };
    const start = () => {
      if (running || reduced || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      readScroll();
      if (!running) draw(0);
    };

    const onScroll = () => {
      readScroll();
      if (reduced) {
        ps = p;
        draw(0);
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    ps = prev = p;
    if (reduced) {
      draw(0);
    } else {
      loop();
    }
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      geo.dispose();
      for (const m of mats) m.dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, []);

  return (
    <div className="ember-layer" aria-hidden="true">
      <div ref={hostRef} className="ember-rays" />
      <div ref={logoRef} className="ember-logo">
        <div className="ember-logo-glow" />
        <Image
          src="/vibe-logo.png"
          alt=""
          width={192}
          height={192}
          className="ember-logo-img"
        />
      </div>
    </div>
  );
}
