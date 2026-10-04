import { v2 as cloudinary } from "cloudinary";
import type { Download, FileStorage } from "./index";

/** Uploads as `authenticated` raw assets, so downloads need a short-lived signed URL. */
export class CloudinaryStorage implements FileStorage {
  constructor() {
    // Reads CLOUDINARY_URL (cloudinary://key:secret@cloud) from the environment.
    cloudinary.config({ secure: true });
  }

  save(key: string, data: Buffer) {
    return new Promise<void>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { public_id: key, resource_type: "raw", type: "authenticated", overwrite: true },
          (err) => (err ? reject(err) : resolve()),
        )
        .end(data);
    });
  }

  async remove(key: string) {
    await cloudinary.uploader.destroy(key, { resource_type: "raw", type: "authenticated" });
  }

  async download(key: string): Promise<Download> {
    const url = cloudinary.url(key, {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      secure: true,
    });
    return { kind: "redirect", url };
  }
}
