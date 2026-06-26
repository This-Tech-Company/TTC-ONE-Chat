import './polyfills/regeneratorRuntime';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './locales/i18n';
import App from './App';
// [TTC unify] Geist Variable — unified family font (matches Workspace).
import '@fontsource-variable/geist';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
/* [TTC unify] Shared TTC One design tokens — imported last so the family
   brand/neutrals override LibreChat's defaults (its upstream token blocks are
   left intact). Single source of truth at repo-root /design/tokens.css. */
import '../../../../design/tokens.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

window.addEventListener('vite:preloadError', (event) => {
  if (window.__lcRecoverStaleAssets?.()) {
    event.preventDefault();
  }
});

const container = document.getElementById('root');
const root = createRoot(container);

async function bootstrap() {
  await initializeI18n();

  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
}

bootstrap().catch((error) => {
  console.error('[i18n] Failed to initialize before render', error);
  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
});
