import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import mantineStyles from '@mantine/core/styles.css?inline';
import { looksLikeScholarlyPage, parsePaperPage } from '../../src/paperUrl';
import { resolveArticleUrl } from '../../src/api';
import { FloatingWidget } from '../../src/components/FloatingWidget';
import { ProjectsProvider } from '../../src/contexts/ProjectsContext';
import { theme } from '../../src/theme';

// Mantine v7 defines all design tokens under :root, which doesn't match inside a
// shadow root. Rewriting to :host puts the variables on the shadow host element so
// they inherit into every shadow descendant.
const shadowMantineStyles = mantineStyles.replace(/:root\b/g, ':host');

export default defineContentScript({
  // PubMed/PMC are included by these broad matches. We need the broad scope
  // because Google Scholar often redirects users to publisher article pages.
  matches: [
    'http://*/*',
    'https://*/*',
  ],
  cssInjectionMode: 'manifest',

  async main() {
    if (!looksLikeScholarlyPage(window.location.href, document)) return;

    const host = document.createElement('div');
    host.style.cssText =
      'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;overflow:visible;pointer-events:none';
    // Needed for :host[data-mantine-color-scheme='light'] rules.
    host.setAttribute('data-mantine-color-scheme', 'light');
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        color-scheme: light;
      }

      .paperlens-root {
        all: initial;
        pointer-events: none;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #22221F;
        line-height: normal;
        text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
      }

      .paperlens-root *,
      .paperlens-root *::before,
      .paperlens-root *::after {
        box-sizing: border-box;
      }

      .paperlens-root button,
      .paperlens-root textarea,
      .paperlens-root input {
        font: inherit;
      }

      ${shadowMantineStyles}
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'paperlens-root';
    // Needed for [data-mantine-color-scheme='light'] .m_xxx descendant rules,
    // which can't see the attribute on the shadow host from inside the tree.
    container.setAttribute('data-mantine-color-scheme', 'light');
    shadow.appendChild(container);

    const root = ReactDOM.createRoot(container);

    try {
      const identity = parsePaperPage(window.location.href, document);
      const doi = identity.type === 'doi' ? identity.id : null;
      const result = await resolveArticleUrl(window.location.href, doi);
      if (!result.scopus_url) return;
      root.render(
        <React.StrictMode>
          <MantineProvider
            theme={theme}
            defaultColorScheme="light"
            cssVariablesSelector=":host"
            getRootElement={() => container}
          >
            <ProjectsProvider>
              <FloatingWidget result={result} shadowContainer={container} />
            </ProjectsProvider>
          </MantineProvider>
        </React.StrictMode>
      );
    } catch {
      // article not in Scopus index — don't show the widget
    }
  },
});
