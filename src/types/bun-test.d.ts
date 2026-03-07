declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: (...args: any[]) => any) => void;
  export const test: typeof it;
  export const expect: any;
}

interface ImportMeta {
  readonly dir: string;
}
