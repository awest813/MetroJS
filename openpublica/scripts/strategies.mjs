// Plays the scripted strategies of docs/STRATEGY_AND_GAMEFLOW.md and prints
// their tables: `npm run strategies` (all), or `npm run strategies -- balanced taxes`.
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { strategyReport } = await server.ssrLoadModule('/src/scenarios/strategyReport.ts');
  console.log(strategyReport(process.argv.slice(2)));
} finally {
  await server.close();
}
