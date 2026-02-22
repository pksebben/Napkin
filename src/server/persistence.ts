import { promises as fs } from "fs";
import path from "path";
import type { DesignSnapshot } from "../shared/types.js";

export interface PersistedSession {
  version: 1;
  name: string;
  createdAt: string;
  currentDesign: string | null;
  nodeCount: number;
  edgeCount: number;
  selectedElements: string[];
  history: DesignSnapshot[];
}

function isValidName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("..") &&
    name !== "." &&
    name !== ".."
  );
}

export class SessionPersistence {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), ".napkin", "sessions");
  }

  private filePath(name: string): string {
    if (!isValidName(name)) {
      throw new Error(`Invalid session name: ${name}`);
    }
    return path.join(this.baseDir, `${name}.json`);
  }

  async load(name: string): Promise<PersistedSession | null> {
    try {
      const data = await fs.readFile(this.filePath(name), "utf-8");
      return JSON.parse(data) as PersistedSession;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async save(name: string, data: PersistedSession): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const target = this.filePath(name);
    const tmp = target + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, target);
  }

  async delete(name: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(name));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
}
