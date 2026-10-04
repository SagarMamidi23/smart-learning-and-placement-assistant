import fs from "node:fs";
import path from "node:path";
import type { Download, FileStorage } from "./index";

export class LocalStorage implements FileStorage {
  constructor(private root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep))
      throw new Error("invalid storage key");
    return full;
  }

  async save(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, data);
  }

  async remove(key: string) {
    await fs.promises.rm(this.resolve(key), { force: true });
  }

  async download(key: string): Promise<Download | null> {
    const file = this.resolve(key);
    if (!fs.existsSync(file)) return null;
    return { kind: "stream", stream: fs.createReadStream(file) };
  }
}
