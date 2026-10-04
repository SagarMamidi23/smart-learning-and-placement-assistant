import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { LocalStorage } from "./local";

describe("LocalStorage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slp-ls-"));
  const store = new LocalStorage(root);
  afterAll(() => fs.promises.rm(root, { recursive: true, force: true }));

  it("rejects keys that escape the root", async () => {
    await expect(store.save("../evil.pdf", Buffer.from("x"))).rejects.toThrow(
      "invalid storage key",
    );
    await expect(store.download("../../etc/passwd")).rejects.toThrow("invalid storage key");
  });

  it("round-trips a file and returns null when missing", async () => {
    await store.save("resumes/a.pdf", Buffer.from("x"));
    const dl = await store.download("resumes/a.pdf");
    expect(dl?.kind).toBe("stream");
    if (dl?.kind === "stream") dl.stream.destroy(); // release the handle so Windows can delete the file
    await store.remove("resumes/a.pdf");
    expect(await store.download("resumes/a.pdf")).toBeNull();
  });
});
