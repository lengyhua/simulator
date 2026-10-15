import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ROUTER_BASENAME } from './config';

// Global stylesheets. Note: `home.css` is intentionally NOT imported here — it
// belongs to the DEV-only home page chunk (see routes.tsx / HomePage.tsx) so
// production bundles stay free of home-page code.
import '@/styles/reset.css';
import '@/styles/fonts.css';
import '@/styles/tokens.css';
import '@/styles/shell.css';
import '@/styles/app.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Mount point #root not found in index.html');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
