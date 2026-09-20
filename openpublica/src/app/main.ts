import '../ui/styles.css';
import { App } from './App';

function boot(): void {
  new App();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
