import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const serverPath = path.join(dir, 'advanced-server.js');
const extensionPath = path.join(dir, 'runtime-extension.js');
const runtimePath = path.join(dir, 'advanced-runtime.mjs');

const [server, extension] = await Promise.all([readFile(serverPath, 'utf8'), readFile(extensionPath, 'utf8')]);
const runtime = `${server}\n\n// --- runtime enterprise extensions ---\n${extension}\n`;
await writeFile(runtimePath, runtime, 'utf8');
await import(pathToFileURL(runtimePath).href + `?build=${Date.now()}`);
