import { describe, expect, test } from "vite-plus/test";

import { boolean, defineEnv, EnvError, number, parseEnv, secret, string } from "../src/env";

const schema = defineEnv({
  NAME: string(),
  GREETING: string({ default: "hi" }),
  NOTE: string({ optional: true }),
  LIMIT: number({ default: 10 }),
  DEBUG: boolean({ default: false }),
  TOKEN: secret(),
});

const valid = { NAME: "app", TOKEN: "s3cret" };

describe("parseEnv", () => {
  test("applies defaults and leaves optional values unset", () => {
    expect(parseEnv(schema, valid)).toEqual({
      NAME: "app",
      GREETING: "hi",
      LIMIT: 10,
      DEBUG: false,
      TOKEN: "s3cret",
    });
  });

  test("parses numbers and booleans from text", () => {
    const env = parseEnv(schema, { ...valid, LIMIT: "42", DEBUG: "TRUE", NOTE: "x" });
    expect(env).toMatchObject({ LIMIT: 42, DEBUG: true, NOTE: "x" });
    expect(parseEnv(schema, { ...valid, DEBUG: "0" }).DEBUG).toBe(false);
  });

  test("keeps an empty string as a value", () => {
    expect(parseEnv(schema, { ...valid, GREETING: "" }).GREETING).toBe("");
  });

  test("reports every problem at once", () => {
    const run = () => parseEnv(schema, { LIMIT: "many", DEBUG: "maybe" });
    expect(run).toThrow(EnvError);
    try {
      run();
    } catch (error) {
      expect((error as EnvError).issues).toEqual([
        "NAME is required",
        'LIMIT must be a number, got "many"',
        'DEBUG must be true, false, 1 or 0, got "maybe"',
        "TOKEN is required",
      ]);
    }
  });

  test("never prints secret values", () => {
    const bad = defineEnv({ KEY: { ...number(), secret: true } });
    expect(() => parseEnv(bad, { KEY: "hunter2" })).toThrow(
      /^Invalid environment:\n- KEY must be a number$/,
    );
  });

  test("rejects non-text values", () => {
    expect(() => parseEnv(schema, { ...valid, NAME: { a: 1 } })).toThrow("NAME must be text");
  });
});
