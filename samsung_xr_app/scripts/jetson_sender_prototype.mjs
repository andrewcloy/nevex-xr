#!/usr/bin/env node

import process from "node:process";
import { parseSenderCliArgs } from "./sender/sender_config.mjs";
import {
  logSenderStartup,
  startJetsonSenderPrototype,
} from "./sender/sender_runtime.mjs";

async function main() {
  const config = parseSenderCliArgs(process.argv.slice(2));
  logSenderStartup(config);
  await startJetsonSenderPrototype(config);
}

main().catch((error) => {
  console.error(
    `[sender-prototype] fatal: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
