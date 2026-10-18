import { describe, it, expect } from "vite-plus/test";

import { GET } from "./index";

describe("index route", () => {
  it("is defined", () => {
    expect(GET).toBeDefined();
  });
});
