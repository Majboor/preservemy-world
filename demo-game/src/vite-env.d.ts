/// <reference types="vite/client" />

declare module "@sparkjsdev/spark" {
  import * as THREE from "three";

  export class SplatMesh extends THREE.Object3D {
    initialized: Promise<void>;
    constructor(options: { url: string; maxSh?: number });
    dispose?: () => void;
  }
}
