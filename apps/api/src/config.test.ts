import { withScheme } from "./config";

describe("withScheme", () => {
  it("adds http:// to a bare host:port, keeps full URLs, and trims trailing slashes", () => {
    expect(withScheme("slp-ml:8000")).toBe("http://slp-ml:8000");
    expect(withScheme("http://localhost:8000/")).toBe("http://localhost:8000");
    expect(withScheme("https://ml.example.com")).toBe("https://ml.example.com");
  });
});
