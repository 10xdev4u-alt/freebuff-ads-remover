#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const mod = await import(pathToFileURL(dist).href);
// Set the code, do not exit: async relay submissions need the event loop to
// drain before they can POST and trim their logs.
process.exitCode = mod.runCli(process.argv.slice(2));
