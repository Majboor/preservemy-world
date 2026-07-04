import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export function Jet({ onReady }: { onReady?: () => void }) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    onReady?.();
    new GLTFLoader().load(
      "./f16.glb",
      (gltf) => {
        if (cancelled) return;
        const clone = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 0.12 / maxDim;
        clone.scale.setScalar(scale);
        clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

        clone.traverse((child) => {
          const mesh = child as THREE.Mesh;
          const material = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (!mesh.isMesh || !material) return;
          if (material.color) {
            const hsl = { h: 0, s: 0, l: 0 };
            material.color.getHSL(hsl);
            if (hsl.l < 0.3) material.color.setHSL(hsl.h, hsl.s, Math.min(0.5, hsl.l + 0.25));
          }
          if ("metalness" in material) material.metalness = Math.min(material.metalness, 0.6);
          if ("roughness" in material) material.roughness = Math.max(material.roughness, 0.3);
          material.envMapIntensity = 1.5;
        });

        setModel(clone);
      },
      undefined,
      (error) => {
        console.warn("F-16 failed to load; using fallback jet.", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return (
    <group>
      {model ? (
        <primitive object={model} />
      ) : (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.035, 0.14, 6]} />
          <meshStandardMaterial color="#22aaff" emissive="#114466" emissiveIntensity={0.45} />
        </mesh>
      )}
      <mesh position={[-0.008, 0, 0.06]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>
      <mesh position={[0.008, 0, 0.06]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>
    </group>
  );
}
