declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: (...args: any[]) => any) => void;
  export const test: typeof it;
  export const afterEach: (fn: () => any) => void;
  export const expect: any;
  export const mock: any;
}

interface ImportMeta {
  readonly dir: string;
}
