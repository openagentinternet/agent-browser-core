#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStandaloneBrowserServer } from './server.js';

function readOption(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) return argv[index + 1];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid Browser standalone port: ${value}`);
  }
  return port;
}

function isDirectCliInvocation(): boolean {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(modulePath) === realpathSync(process.argv[1]);
  } catch {
    return modulePath === process.argv[1];
  }
}

export async function main(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const host = readOption(argv, '--host') ?? env.BROWSER_HOST ?? '127.0.0.1';
  const port = parsePort(readOption(argv, '--port') ?? env.BROWSER_PORT ?? '8787');
  const server = createStandaloneBrowserServer();

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.listen(port, host, onListening);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`Agent Internet Browser listening at http://${host}:${actualPort}/browser\n`);
}

if (isDirectCliInvocation()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
