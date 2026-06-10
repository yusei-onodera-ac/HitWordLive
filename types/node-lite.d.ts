declare module 'node:child_process' { export function execFileSync(command: string, args?: string[], options?: { encoding?: BufferEncoding }): string; }
declare module 'node:http' { export function createServer(listener: (req: any, res: any) => void): any; }
declare module 'node:fs' { export const existsSync: any; export const readFileSync: any; export const mkdirSync: any; export const copyFileSync: any; }
declare module 'node:path' { export const extname: any; export const join: any; }
declare module 'node:url' { export function fileURLToPath(url: string): string; }
declare module 'node:test' { export function describe(name: string, fn: () => void): void; export function it(name: string, fn: () => void): void; }
declare module 'node:assert/strict' { const assert: { deepEqual(actual: unknown, expected: unknown): void; equal(actual: unknown, expected: unknown): void; }; export default assert; }
declare type BufferEncoding = 'utf8' | string;
declare namespace NodeJS { type Timeout = ReturnType<typeof setTimeout>; }
declare const process: { env: Record<string, string | undefined>; cwd(): string; };
