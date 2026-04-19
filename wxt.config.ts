import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.png',
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser !== 'firefox') {
        return;
      }

      manifest.browser_specific_settings = {
        gecko: {
          id: 'sudofill-dev@localhost',
        },
      };
    },
  },
  manifest: ({ browser }) => ({
    name: 'SudoFill',
    description: 'Temporary identity and email extension',
    permissions: browser === 'firefox' ? ['storage', 'alarms'] : ['storage', 'alarms', 'sidePanel'],
    host_permissions: ['https://api.mail.tm/*'],
    action: {
      default_title: 'SudoFill',
      ...(browser === 'firefox' ? { default_popup: 'sidepanel.html' } : {}),
    },
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
