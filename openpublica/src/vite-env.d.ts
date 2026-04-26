// Allow Vite to import CSS files as side-effects.
declare module '*.css' {
  const _: string;
  export default _;
}
