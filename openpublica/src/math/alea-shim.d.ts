declare module 'alea' {
  export default function Alea(...seed: Array<string | number>): () => number;
}
