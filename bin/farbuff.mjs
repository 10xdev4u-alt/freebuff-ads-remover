#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist', 'cli.js');
const mod = await import(pathToFileURL(dist).href);
process.exit(mod.runCli(process.argv.slice(2)));
