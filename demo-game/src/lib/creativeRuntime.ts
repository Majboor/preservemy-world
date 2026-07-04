import type { CreativeScript, CreativeScriptTrigger } from "../types";

export interface CreativeRuntimeActions {
  showMessage: (message: string) => void;
  setObjective: (objective: string) => void;
  addScore: (delta: number) => void;
  setHealth: (health: number) => void;
  returnHome: () => void;
  completeStoryStep: () => void;
  giveLoadout: (weapon: string) => void;
}

export interface CreativeRuntimeEvent {
  trigger: CreativeScriptTrigger;
  targetId?: string;
  scriptId?: string;
}

export interface CreativeRuntimeResult {
  ran: number;
  warnings: string[];
}

type CreativeCommand = keyof CreativeRuntimeActions;

const COMMANDS = new Set<CreativeCommand>([
  "showMessage",
  "setObjective",
  "addScore",
  "setHealth",
  "returnHome",
  "completeStoryStep",
  "giveLoadout",
]);

function splitLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

function parseArgs(rawArgs: string): Array<string | number | boolean> {
  const args: Array<string | number | boolean> = [];
  let token = "";
  let quote: "'" | "\"" | undefined;
  let escaping = false;

  const pushToken = () => {
    const value = token.trim();
    token = "";
    if (!value.length) return;
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      args.push(Number(value));
    } else if (value === "true" || value === "false") {
      args.push(value === "true");
    } else {
      args.push(value);
    }
  };

  for (const char of rawArgs) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        token += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ",") {
      pushToken();
      continue;
    }
    token += char;
  }

  pushToken();
  return args;
}

function runCommand(
  command: CreativeCommand,
  args: Array<string | number | boolean>,
  actions: CreativeRuntimeActions,
): string | undefined {
  if (command === "showMessage") {
    actions.showMessage(String(args[0] ?? ""));
    return undefined;
  }
  if (command === "setObjective") {
    actions.setObjective(String(args[0] ?? ""));
    return undefined;
  }
  if (command === "addScore") {
    const delta = Number(args[0] ?? 1);
    if (!Number.isFinite(delta)) return "addScore expects a number";
    actions.addScore(delta);
    return undefined;
  }
  if (command === "setHealth") {
    const health = Number(args[0] ?? 100);
    if (!Number.isFinite(health)) return "setHealth expects a number";
    actions.setHealth(health);
    return undefined;
  }
  if (command === "returnHome") {
    actions.returnHome();
    return undefined;
  }
  if (command === "completeStoryStep") {
    actions.completeStoryStep();
    return undefined;
  }
  if (command === "giveLoadout") {
    actions.giveLoadout(String(args[0] ?? "pulse-cannon"));
    return undefined;
  }
  return `${command} is unavailable`;
}

function shouldRun(script: CreativeScript, event: CreativeRuntimeEvent): boolean {
  if (!script.enabled || script.trigger !== event.trigger) return false;
  if (event.scriptId && script.id === event.scriptId) return true;
  if (!script.targetId) return true;
  return script.targetId === event.targetId;
}

export function runCreativeScripts(
  scripts: CreativeScript[] | undefined,
  event: CreativeRuntimeEvent,
  actions: CreativeRuntimeActions,
): CreativeRuntimeResult {
  const warnings: string[] = [];
  let ran = 0;
  for (const script of scripts ?? []) {
    if (!shouldRun(script, event)) continue;
    for (const line of splitLines(script.source)) {
      const match = line.match(/^([a-zA-Z_]\w*)\((.*)\);?$/);
      if (!match) {
        warnings.push(`${script.label}: "${line}" is not a supported command`);
        continue;
      }
      const command = match[1] as CreativeCommand;
      if (!COMMANDS.has(command)) {
        warnings.push(`${script.label}: ${command} is not allowed`);
        continue;
      }
      const warning = runCommand(command, parseArgs(match[2]), actions);
      if (warning) warnings.push(`${script.label}: ${warning}`);
    }
    ran += 1;
  }
  return { ran, warnings };
}
