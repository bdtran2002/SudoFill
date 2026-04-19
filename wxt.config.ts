import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.png',
  },
  manifest: {
    name: 'SudoFill',
    description: 'Temporary identity and email extension',
    permissions: ['storage', 'alarms', 'tabs'],
    host_permissions: ['https://api.mail.tm/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
