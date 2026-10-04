import type { Readable } from "node:stream";
import { config } from "../config";
import { LocalStorage } from "./local";
import { CloudinaryStorage } from "./cloudinary";

export type Download = { kind: "stream"; stream: Readable } | { kind: "redirect"; url: string };

/** Private file storage for resumes. Files are never publicly addressable. */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  download(key: string): Promise<Download | null>;
}

let instance: FileStorage | undefined;

export function getStorage(): FileStorage {
  instance ??= config.cloudinaryUrl ? new CloudinaryStorage() : new LocalStorage(config.uploadDir);
  return instance;
}
