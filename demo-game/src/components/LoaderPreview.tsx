import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface PreviewData {
  positions: number[];
  colors: number[];
  count?: number;
}

export function LoaderPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const activeCanvas = canvas;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.warn("Loader point cloud preview unavailable:", error);
      setFallback(true);
      return undefined;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 1000);
    const group = new THREE.Group();
    const clock = new THREE.Clock();
    const center = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const state = {
      disposed: false,
      ready: false,
      count: 0,
      radius: 1,
      width: 0,
      height: 0,
      isMobile: window.innerWidth <= 640,
    };

    scene.add(group);
    renderer.setClearColor(0x000000, 0);

    function resize() {
      const width = Math.max(1, activeCanvas.clientWidth || window.innerWidth);
      const height = Math.max(1, activeCanvas.clientHeight || window.innerHeight);
      if (width === state.width && height === state.height) return;
      state.width = width;
      state.height = height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Preview load failed: ${response.status}`);
        return response.json() as Promise<PreviewData>;
      })
      .then((data) => {
        if (state.disposed) return;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(data.positions);
        const colors = new Float32Array(data.colors);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange(0, 1);
        geometry.computeBoundingBox();

        const box = geometry.boundingBox;
        if (box) {
          box.getCenter(center);
          state.radius = Math.max(0.1, box.getSize(new THREE.Vector3()).length() * 0.48);
          geometry.translate(-center.x, -center.y, -center.z);
        }

        const explosion = new Float32Array(positions.length);
        const phase = new Float32Array(positions.length / 3);
        const maxSpread = state.radius * (state.isMobile ? 1.35 : 1.75);

        for (let i = 0, p = 0; i < positions.length; i += 3, p += 1) {
          scratch.set(positions[i] - center.x, positions[i + 1] - center.y, positions[i + 2] - center.z);
          const baseLength = Math.max(0.001, scratch.length());
          const angle = p * 2.399963229728653;
          const band = ((p % 97) / 96) * 2 - 1;
          const ring = Math.sqrt(Math.max(0, 1 - band * band));
          const outward = scratch.multiplyScalar(1 / baseLength);
          const scatter = new THREE.Vector3(Math.cos(angle) * ring, band, Math.sin(angle) * ring);
          scatter.lerp(outward, 0.44).normalize();
          const drift = maxSpread * (0.72 + ((p * 37) % 101) / 100);
          explosion[i] = scatter.x * drift;
          explosion[i + 1] = scatter.y * drift;
          explosion[i + 2] = scatter.z * drift;
          phase[p] = (p % 997) / 997;
        }

        geometry.setAttribute("aExplosion", new THREE.BufferAttribute(explosion, 3));
        geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uReveal: { value: 0 },
            uPointSize: { value: state.isMobile ? 6.8 : 4.4 },
            uOpacity: { value: state.isMobile ? 0.98 : 0.9 },
          },
          vertexShader: `
            attribute vec3 aColor;
            attribute vec3 aExplosion;
            attribute float aPhase;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uTime;
            uniform float uReveal;
            uniform float uPointSize;
            void main() {
              float assemble = smoothstep(0.1, 0.95, uReveal);
              float spread = 1.0 - assemble;
              float wave = sin(uTime * 0.85 + aPhase * 37.699) * 0.08;
              float ripple = sin(uTime * 0.32 + length(aExplosion) * 0.018) * 0.045;
              vec3 pos = position + aExplosion * (spread * (1.0 + wave + ripple));
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              float depthScale = clamp(230.0 / max(12.0, -mvPosition.z), 0.45, 3.4);
              gl_PointSize = uPointSize * depthScale * (1.0 + spread * 0.7);
              vColor = aColor;
              vAlpha = 0.36 + assemble * 0.44 + spread * (0.24 + aPhase * 0.18);
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uOpacity;
            void main() {
              vec2 uv = gl_PointCoord - vec2(0.5);
              float d = dot(uv, uv);
              if (d > 0.25) discard;
              float soft = smoothstep(0.25, 0.02, d);
              gl_FragColor = vec4(vColor, soft * vAlpha * uOpacity);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        group.add(new THREE.Points(geometry, material));
        state.count = data.count || positions.length / 3;
        state.ready = true;
      })
      .catch((error) => {
        console.warn("Loader point cloud preview unavailable:", error);
      });

    let raf = 0;
    function render() {
      if (state.disposed) return;
      raf = requestAnimationFrame(render);
      resize();

      const elapsed = clock.getElapsedTime();
      group.rotation.y = elapsed * 0.035;
      group.rotation.x = -0.18 + Math.sin(elapsed * 0.24) * 0.04;
      group.rotation.z = Math.sin(elapsed * 0.16) * 0.035;

      camera.position.set(
        Math.sin(elapsed * 0.12) * state.radius * (state.isMobile ? 0.2 : 0.34),
        state.radius * (state.isMobile ? 0.28 : 0.18),
        state.radius * (state.isMobile ? 1.18 : 1.45),
      );
      camera.lookAt(0, 0, 0);

      const points = group.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
      if (state.ready && points) {
        const reveal = Math.min(1, elapsed / 16);
        const eased = 1 - Math.pow(1 - reveal, 3);
        points.geometry.setDrawRange(0, Math.max(1, Math.floor(state.count * eased)));
        points.material.uniforms.uTime.value = elapsed;
        points.material.uniforms.uReveal.value = eased;
      }

      try {
        renderer.render(scene, camera);
      } catch (error) {
        console.warn("Loader point cloud preview stopped:", error);
        state.disposed = true;
        setFallback(true);
      }
    }

    render();

    return () => {
      state.disposed = true;
      cancelAnimationFrame(raf);
      group.traverse((object) => {
        const mesh = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material };
        mesh.geometry?.dispose();
        mesh.material?.dispose();
      });
      renderer.dispose();
    };
  }, [url]);

  if (fallback) {
    return (
      <div className="loader-preview loader-preview--fallback" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    );
  }

  return <canvas ref={canvasRef} className="loader-preview" aria-hidden="true" />;
}
