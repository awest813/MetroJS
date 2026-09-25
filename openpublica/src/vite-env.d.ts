/// <reference types="vite/client" />

// Allow Vite to import CSS files as side-effects.
declare module '*.css' {
  const _: string;
  export default _;
}

declare module 'alea' {
  export default function Alea(...seed: Array<string | number>): () => number;
}
