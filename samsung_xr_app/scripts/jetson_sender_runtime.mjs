#!/usr/bin/env node

import process from "node:process";
import { runJetsonSenderRuntimeCli } from "./sender/sender_runtime.mjs";

async function main() {
  await runJetsonSenderRuntimeCli(process.argv.slice(2));
}

main().catch((error) => {
  console.error(
    `[sender-prototype] fatal: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
