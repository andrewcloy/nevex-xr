import { describe, expect, it } from "vitest";
import { DEFAULT_SENDER_CONFIG, parseSenderCliArgs } from "./sender_config.mjs";

describe("sender config defaults", () => {
  it("binds the sender for LAN reachability by default", () => {
    expect(DEFAULT_SENDER_CONFIG.host).toBe("0.0.0.0");
  });

  it("still allows overriding the bind host explicitly", () => {
    const config = parseSenderCliArgs(["--host", "127.0.0.1"]);

    expect(config.host).toBe("127.0.0.1");
  });
});
