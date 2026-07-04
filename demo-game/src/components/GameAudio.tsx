import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_THROTTLE_SPEED, throttlePercent } from "../lib/flightTuning";
import type { GameMode, PlayerSnapshot, SceneBundle, Vec3Tuple } from "../types";

type SoundName =
  | "ui-hover"
  | "ui-click"
  | "ui-open"
  | "ui-close"
  | "collect"
  | "collision"
  | "boundary"
  | "entry"
  | "error";

interface AmbientBed {
  context: AudioContext;
  master: GainNode;
  cleanup: () => void;
}

type AmbientFxKind = "bell" | "bird" | "electric" | "beacon";

interface JetEngineBed {
  context: AudioContext;
  master: GainNode;
  panner: StereoPannerNode | null;
  noiseSource: AudioBufferSourceNode;
  roarGain: GainNode;
  roarFilter: BiquadFilterNode;
  afterburnerGain: GainNode;
  afterburnerFilter: BiquadFilterNode;
  rumbleOsc: OscillatorNode;
  rumbleGain: GainNode;
  turbineOsc: OscillatorNode;
  turbineGain: GainNode;
  cleanup: () => void;
}

const VOLUME: Record<SoundName, number> = {
  "ui-hover": 0.26,
  "ui-click": 0.36,
  "ui-open": 0.34,
  "ui-close": 0.28,
  collect: 0.48,
  collision: 0.58,
  boundary: 0.42,
  entry: 0.44,
  error: 0.36,
};

function chooseExtension(): "ogg" | "mp3" {
  const probe = new Audio();
  return probe.canPlayType('audio/ogg; codecs="vorbis"') ? "ogg" : "mp3";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createAudio(path: string, loop = false): HTMLAudioElement {
  const audio = new Audio(path);
  audio.preload = "auto";
  audio.loop = loop;
  return audio;
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  return window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function makeNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  let mid = 0;

  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    low = low * 0.985 + white * 0.015;
    mid = mid * 0.76 + white * 0.24;
    data[index] = Math.max(-1, Math.min(1, low * 3.2 + mid * 0.55 + white * 0.13));
  }

  return buffer;
}

function createAmbientBed(): AmbientBed | null {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  const lowDrone = context.createOscillator();
  const highDrone = context.createOscillator();
  const lowGain = context.createGain();
  const highGain = context.createGain();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();

  master.gain.value = 0;
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.45;
  lowDrone.type = "sine";
  lowDrone.frequency.value = 55;
  highDrone.type = "triangle";
  highDrone.frequency.value = 110;
  lowGain.gain.value = 0.23;
  highGain.gain.value = 0.045;
  lfo.type = "sine";
  lfo.frequency.value = 0.055;
  lfoGain.gain.value = 55;

  lowDrone.connect(lowGain).connect(filter);
  highDrone.connect(highGain).connect(filter);
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(master).connect(context.destination);

  lowDrone.start();
  highDrone.start();
  lfo.start();

  return {
    context,
    master,
    cleanup: () => {
      lowDrone.stop();
      highDrone.stop();
      lfo.stop();
      context.close().catch(() => undefined);
    },
  };
}

function createJetEngineBed(): JetEngineBed | null {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
  const noiseSource = context.createBufferSource();
  const roarFilter = context.createBiquadFilter();
  const roarGain = context.createGain();
  const afterburnerFilter = context.createBiquadFilter();
  const afterburnerGain = context.createGain();
  const rumbleOsc = context.createOscillator();
  const rumbleGain = context.createGain();
  const turbineOsc = context.createOscillator();
  const turbineFilter = context.createBiquadFilter();
  const turbineGain = context.createGain();

  noiseSource.buffer = makeNoiseBuffer(context);
  noiseSource.loop = true;
  noiseSource.playbackRate.value = 0.82;

  roarFilter.type = "lowpass";
  roarFilter.frequency.value = 760;
  roarFilter.Q.value = 0.62;
  roarGain.gain.value = 0;

  afterburnerFilter.type = "bandpass";
  afterburnerFilter.frequency.value = 92;
  afterburnerFilter.Q.value = 0.9;
  afterburnerGain.gain.value = 0;

  rumbleOsc.type = "sine";
  rumbleOsc.frequency.value = 38;
  rumbleGain.gain.value = 0;

  turbineOsc.type = "sawtooth";
  turbineOsc.frequency.value = 190;
  turbineFilter.type = "bandpass";
  turbineFilter.frequency.value = 880;
  turbineFilter.Q.value = 5.4;
  turbineGain.gain.value = 0;

  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.24;
  master.gain.value = 0;

  noiseSource.connect(roarFilter).connect(roarGain).connect(master);
  noiseSource.connect(afterburnerFilter).connect(afterburnerGain).connect(master);
  rumbleOsc.connect(rumbleGain).connect(master);
  turbineOsc.connect(turbineFilter).connect(turbineGain).connect(master);
  master.connect(compressor);
  if (panner) {
    compressor.connect(panner).connect(context.destination);
  } else {
    compressor.connect(context.destination);
  }

  noiseSource.start();
  rumbleOsc.start();
  turbineOsc.start();

  return {
    context,
    master,
    panner,
    noiseSource,
    roarGain,
    roarFilter,
    afterburnerGain,
    afterburnerFilter,
    rumbleOsc,
    rumbleGain,
    turbineOsc,
    turbineGain,
    cleanup: () => {
      try {
        noiseSource.stop();
        rumbleOsc.stop();
        turbineOsc.stop();
      } catch {
        // The audio graph may already be stopped by browser teardown.
      }
      context.close().catch(() => undefined);
    },
  };
}

function rampGain(context: AudioContext, gain: GainNode, value: number, seconds = 0.45) {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(value, now, seconds / 3);
}

function rampParam(context: AudioContext, param: AudioParam, value: number, seconds = 0.28) {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, seconds / 3);
}

function angleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function randomAmbientPosition(bundle: SceneBundle): Vec3Tuple {
  const x = bundle.bounds.lo[0] + Math.random() * (bundle.bounds.hi[0] - bundle.bounds.lo[0]);
  const y = bundle.activeFloor.yMin + Math.random() * Math.max(0.05, bundle.activeFloor.yMax - bundle.activeFloor.yMin);
  const z = bundle.bounds.lo[2] + Math.random() * (bundle.bounds.hi[2] - bundle.bounds.lo[2]);
  return [x, y, z];
}

function spatialAudioParams(player: PlayerSnapshot, position: Vec3Tuple, bundle: SceneBundle, rangeOverride?: number) {
  const dx = position[0] - player.x;
  const dy = position[1] - player.y;
  const dz = position[2] - player.z;
  const distance = Math.hypot(dx, dy, dz);
  const width = Math.max(1, bundle.bounds.hi[0] - bundle.bounds.lo[0]);
  const depth = Math.max(1, bundle.bounds.hi[2] - bundle.bounds.lo[2]);
  const fallbackRange = Math.max(4, Math.min(18, Math.max(width, depth) * 0.45));
  const range = Math.max(1, rangeOverride ?? fallbackRange);
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);
  const lateral = (dx * rightX + dz * rightZ) / Math.max(0.001, distance);
  return {
    pan: Math.max(-0.86, Math.min(0.86, lateral)),
    volume: Math.max(0, 1 - distance / range),
  };
}

function connectSpatial(context: AudioContext, destination: AudioNode, pan: number): GainNode {
  const gain = context.createGain();
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner).connect(destination);
  } else {
    gain.connect(destination);
  }
  return gain;
}

function playAmbientTone(
  context: AudioContext,
  destination: AudioNode,
  kind: AmbientFxKind,
  pan: number,
  amount: number,
) {
  const now = context.currentTime;
  const output = connectSpatial(context, destination, pan);
  const volume = Math.max(0.005, amount);
  output.gain.setValueAtTime(0.0001, now);

  if (kind === "bird") {
    output.gain.exponentialRampToValueAtTime(volume * 0.16, now + 0.025);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    for (let index = 0; index < 3; index += 1) {
      const osc = context.createOscillator();
      osc.type = "sine";
      const start = now + index * 0.08;
      osc.frequency.setValueAtTime(1200 + Math.random() * 450, start);
      osc.frequency.exponentialRampToValueAtTime(1900 + Math.random() * 650, start + 0.045);
      osc.frequency.exponentialRampToValueAtTime(900 + Math.random() * 300, start + 0.095);
      osc.connect(output);
      osc.start(start);
      osc.stop(start + 0.12);
    }
    window.setTimeout(() => output.disconnect(), 520);
    return;
  }

  if (kind === "electric") {
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(47 + Math.random() * 18, now);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(420 + Math.random() * 360, now);
    filter.Q.value = 6;
    output.gain.exponentialRampToValueAtTime(volume * 0.11, now + 0.02);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(filter).connect(output);
    osc.start(now);
    osc.stop(now + 0.46);
    window.setTimeout(() => output.disconnect(), 620);
    return;
  }

  const fundamental = kind === "bell"
    ? 520 + Math.random() * 170
    : 180 + Math.random() * 80;
  output.gain.exponentialRampToValueAtTime(volume * (kind === "bell" ? 0.2 : 0.12), now + 0.018);
  output.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "bell" ? 1.65 : 0.78));
  [1, 2.01, 3.92].forEach((ratio, index) => {
    const osc = context.createOscillator();
    const partial = context.createGain();
    osc.type = index === 0 ? "sine" : "triangle";
    osc.frequency.value = fundamental * ratio;
    partial.gain.value = index === 0 ? 1 : 0.32 / index;
    osc.connect(partial).connect(output);
    osc.start(now);
    osc.stop(now + (kind === "bell" ? 1.8 : 0.9));
  });
  window.setTimeout(() => output.disconnect(), kind === "bell" ? 2100 : 1100);
}

function isInteractiveTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const element = target.closest<HTMLElement>("button, a, [role='button'], [role='slider'], .game-menu__rail-item");
  if (!element) return null;
  if (element.matches("button:disabled, [aria-disabled='true']")) return null;
  return element;
}

export function GameAudio({
  mode,
  bundle,
  player,
  collected,
  total,
  throttleSpeed,
  message,
}: {
  mode: GameMode;
  bundle: SceneBundle;
  player: PlayerSnapshot;
  collected: number;
  total: number;
  throttleSpeed: number;
  message?: string;
}) {
  const extension = useMemo(() => chooseExtension(), []);
  const clips = useMemo(() => {
    const names: SoundName[] = [
      "ui-hover",
      "ui-click",
      "ui-open",
      "ui-close",
      "collect",
      "collision",
      "boundary",
      "entry",
      "error",
    ];
    return Object.fromEntries(names.map((name) => [
      name,
      createAudio(`./sfx/${name}.${extension}`),
    ])) as Record<SoundName, HTMLAudioElement>;
  }, [extension]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const unlockedRef = useRef(false);
  const ambientRef = useRef<AmbientBed | null>(null);
  const jetRef = useRef<JetEngineBed | null>(null);
  const bundleRef = useRef(bundle);
  const playerRef = useRef(player);
  const lastHoverRef = useRef<{ element: HTMLElement | null; time: number }>({ element: null, time: 0 });
  const lastCollisionRef = useRef(0);
  const previousCollectedRef = useRef(collected);
  const previousMessageRef = useRef<string>();
  const previousThrottleRef = useRef(throttleSpeed);
  const previousModeRef = useRef(mode);
  const previousJetYawRef = useRef(player.yaw);
  const previousJetTimeRef = useRef(performance.now());
  const ambientTimerRef = useRef<number>();

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const play = (name: SoundName, rate = 1) => {
    if (!unlockedRef.current) return;
    const audio = clips[name];
    audio.pause();
    audio.currentTime = 0;
    audio.volume = VOLUME[name];
    audio.playbackRate = rate;
    audio.play().catch(() => undefined);
  };

  useEffect(() => {
    const all = [...Object.values(clips)];
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      ambientRef.current = createAmbientBed();
      jetRef.current = createJetEngineBed();
      ambientRef.current?.context.resume().catch(() => undefined);
      jetRef.current?.context.resume().catch(() => undefined);
      setAudioUnlocked(true);
      all.forEach((audio) => {
        const muted = audio.muted;
        audio.muted = true;
        audio.play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = muted;
          })
          .catch(() => {
            audio.muted = muted;
          });
      });
    };

    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [clips]);

  useEffect(() => {
    const ambient = ambientRef.current;
    if (!audioUnlocked || !ambient) return;
    const speedRatio = clamp01(player.speed / MAX_THROTTLE_SPEED);
    const targetVolume = mode === "playing"
      ? 0.035 + speedRatio * 0.035
      : mode === "route"
        ? 0.052
        : 0.032;
    ambient.context.resume().catch(() => undefined);
    rampGain(ambient.context, ambient.master, targetVolume);
  }, [audioUnlocked, mode, player.speed]);

  useEffect(() => {
    const ambient = ambientRef.current;
    if (!audioUnlocked || !ambient) return undefined;
    if (mode !== "home" && mode !== "playing" && mode !== "route") return undefined;

    const schedule = () => {
      const currentBundle = bundleRef.current;
      const authoredSounds = (currentBundle.gameConfig?.ambientSounds ?? []).filter((sound) => (
        sound.enabled && (!sound.floorId || sound.floorId === currentBundle.activeFloor.id)
      ));
      const pickedSound = authoredSounds[Math.floor(Math.random() * authoredSounds.length)];
      const delay = pickedSound
        ? Math.max(1200, pickedSound.intervalSeconds * 1000 * (0.72 + Math.random() * 0.56))
        : 2600 + Math.random() * (mode === "home" ? 2600 : 5200);
      ambientTimerRef.current = window.setTimeout(() => {
        const latestBundle = bundleRef.current;
        const latestPlayer = playerRef.current;
        const authored = (latestBundle.gameConfig?.ambientSounds ?? []).filter((sound) => (
          sound.enabled && (!sound.floorId || sound.floorId === latestBundle.activeFloor.id)
        ));
        const sound = authored[Math.floor(Math.random() * authored.length)];
        if (sound) {
          const spatial = spatialAudioParams(latestPlayer, sound.position, latestBundle, sound.radius);
          const base = (mode === "home" ? 0.24 : 0.17) * sound.volume;
          playAmbientTone(ambient.context, ambient.master, sound.kind, spatial.pan, base * (0.25 + spatial.volume * 0.95));
        } else {
          const kindPool: AmbientFxKind[] = mode === "home"
            ? ["bell", "electric", "beacon", "bird"]
            : ["bird", "bell", "electric", "beacon", "bird"];
          const kind = kindPool[Math.floor(Math.random() * kindPool.length)];
          const position = randomAmbientPosition(latestBundle);
          const spatial = spatialAudioParams(latestPlayer, position, latestBundle);
          const base = mode === "home" ? 0.22 : 0.16;
          playAmbientTone(ambient.context, ambient.master, kind, spatial.pan, base * (0.35 + spatial.volume * 0.85));
        }
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      if (ambientTimerRef.current) window.clearTimeout(ambientTimerRef.current);
      ambientTimerRef.current = undefined;
    };
  }, [audioUnlocked, mode]);

  useEffect(() => {
    const jet = jetRef.current;
    if (!audioUnlocked || !jet) return;

    const now = performance.now();
    const dt = Math.max(0.016, (now - previousJetTimeRef.current) / 1000);
    const yawDelta = angleDelta(previousJetYawRef.current, player.yaw);
    const turnRate = yawDelta / dt;
    previousJetYawRef.current = player.yaw;
    previousJetTimeRef.current = now;

    const active = mode === "playing" || mode === "route";
    const speedRatio = clamp01(player.speed / MAX_THROTTLE_SPEED);
    const throttleRatio = throttlePercent(throttleSpeed) / 100;
    const thrust = clamp01(speedRatio * 0.76 + throttleRatio * 0.24);
    const turn = Math.max(-1, Math.min(1, turnRate / 2.6));
    const turnEnergy = Math.min(1, Math.abs(turnRate) / 2.8);
    const boost = player.boost ? 1 : 0;

    const masterVolume = active ? 0.08 + thrust ** 1.35 * 0.42 + boost * 0.14 : 0;
    const roarVolume = active ? 0.18 + thrust ** 1.55 * 0.82 + boost * 0.36 + turnEnergy * 0.08 : 0;
    const rumbleVolume = active ? 0.09 + thrust * 0.26 + boost * 0.22 : 0;
    const turbineVolume = active ? 0.018 + thrust * 0.07 + turnEnergy * 0.025 : 0;
    const afterburnerVolume = active ? Math.max(0, thrust - 0.58) * 0.62 + boost * 0.42 : 0;

    jet.context.resume().catch(() => undefined);
    rampGain(jet.context, jet.master, masterVolume, 0.5);
    rampGain(jet.context, jet.roarGain, roarVolume, 0.28);
    rampGain(jet.context, jet.rumbleGain, rumbleVolume, 0.42);
    rampGain(jet.context, jet.turbineGain, turbineVolume, 0.22);
    rampGain(jet.context, jet.afterburnerGain, afterburnerVolume, 0.2);

    rampParam(jet.context, jet.noiseSource.playbackRate, 0.72 + thrust * 0.62 + boost * 0.18, 0.35);
    rampParam(jet.context, jet.roarFilter.frequency, 680 + thrust ** 1.35 * 4100 + boost * 1400 + turnEnergy * 850, 0.3);
    rampParam(jet.context, jet.afterburnerFilter.frequency, 74 + thrust * 62 + boost * 20, 0.24);
    rampParam(jet.context, jet.rumbleOsc.frequency, 34 + thrust * 58 + boost * 14, 0.28);
    rampParam(jet.context, jet.turbineOsc.frequency, 170 + thrust * 520 + turnEnergy * 90, 0.18);
    if (jet.panner) rampParam(jet.context, jet.panner.pan, turn * 0.72, 0.16);
  }, [audioUnlocked, mode, player.boost, player.speed, player.yaw, throttleSpeed]);

  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => {
      const element = isInteractiveTarget(event.target);
      if (!element) return;
      const now = performance.now();
      if (lastHoverRef.current.element === element && now - lastHoverRef.current.time < 240) return;
      if (now - lastHoverRef.current.time < 55) return;
      lastHoverRef.current = { element, time: now };
      play("ui-hover", 0.96 + Math.random() * 0.08);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInteractiveTarget(event.target)) return;
      play("ui-click", 0.98 + Math.random() * 0.04);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  });

  useEffect(() => {
    const previous = previousModeRef.current;
    if (previous === mode) return;
    previousModeRef.current = mode;

    if (mode === "paused" || mode === "home") {
      play("ui-open");
    } else if (mode === "playing" || mode === "route") {
      play("ui-close", mode === "route" ? 0.92 : 1);
    }
  }, [mode]);

  useEffect(() => {
    if (collected > previousCollectedRef.current) {
      play(collected >= total ? "ui-open" : "collect");
    }
    previousCollectedRef.current = collected;
  }, [collected, total]);

  useEffect(() => {
    if (!message || message === previousMessageRef.current) return;
    previousMessageRef.current = message;
    if (message.startsWith("Entered ")) {
      play("entry");
    } else if (message.includes("Run complete") || message.includes("saved") || message.includes("copied")) {
      play("ui-open");
    } else if (message.startsWith("No ") || message.includes("invalid") || message.includes("unavailable") || message.includes("failed")) {
      play("error");
    }
  }, [message]);

  useEffect(() => {
    const delta = Math.abs(throttleSpeed - previousThrottleRef.current);
    previousThrottleRef.current = throttleSpeed;
    if (delta > 0.04) play("ui-hover", 0.9 + throttlePercent(throttleSpeed) / 500);
  }, [throttleSpeed]);

  useEffect(() => {
    const now = performance.now();
    if ((player.status === "Boundary" || player.status === "Floor limit") && now - lastCollisionRef.current > 620) {
      lastCollisionRef.current = now;
      play(player.status === "Boundary" ? "collision" : "boundary");
    }
  }, [player.status]);

  useEffect(() => {
    previousJetYawRef.current = player.yaw;
    previousJetTimeRef.current = performance.now();
  }, [mode, player.yaw]);

  useEffect(() => () => {
    if (ambientTimerRef.current) window.clearTimeout(ambientTimerRef.current);
    ambientRef.current?.cleanup();
    jetRef.current?.cleanup();
    Object.values(clips).forEach((audio) => audio.pause());
  }, [clips]);

  return null;
}
