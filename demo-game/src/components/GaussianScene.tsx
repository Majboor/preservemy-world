import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { SplatMesh } from "@sparkjsdev/spark";
import type { SceneAlignment, Vec3Tuple } from "../types";

export function GaussianScene({
  url,
  alignment,
  position = [0, 0, 0],
  rotation,
  scale = 1,
  onReady,
  onError,
}: {
  url: string;
  alignment: SceneAlignment;
  position?: Vec3Tuple;
  rotation?: SceneAlignment;
  scale?: number;
  onReady: () => void;
  onError: (error: unknown) => void;
}) {
  const scene = useThree((state) => state.scene);
  const splatRef = useRef<SplatMesh | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onError, onReady]);

  useEffect(() => {
    let cancelled = false;
    const splat = new SplatMesh({ url, maxSh: 3 });
    const layerRotation = rotation ?? { x: 0, y: 0, z: 0 };
    splat.position.set(position[0], position[1], position[2]);
    splat.rotation.set(
      alignment.x + layerRotation.x,
      alignment.y + layerRotation.y,
      alignment.z + layerRotation.z,
      "XYZ",
    );
    splat.scale.setScalar(scale);
    splatRef.current = splat;
    scene.add(splat);

    splat.initialized
      .then(() => {
        if (!cancelled) onReadyRef.current();
      })
      .catch((error: unknown) => {
        if (!cancelled) onErrorRef.current(error);
      });

    return () => {
      cancelled = true;
      scene.remove(splat);
      if (splatRef.current === splat) splatRef.current = null;
      splat.dispose?.();
    };
  }, [scene, url]);

  useEffect(() => {
    if (!splatRef.current) return;
    const layerRotation = rotation ?? { x: 0, y: 0, z: 0 };
    splatRef.current.position.set(position[0], position[1], position[2]);
    splatRef.current.rotation.set(
      alignment.x + layerRotation.x,
      alignment.y + layerRotation.y,
      alignment.z + layerRotation.z,
      "XYZ",
    );
    splatRef.current.scale.setScalar(scale);
  }, [alignment.x, alignment.y, alignment.z, position, rotation, scale]);

  return null;
}
