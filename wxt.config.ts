import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const DEFAULT_FIREFOX_EXTENSION_ID = 'sudofill@selfhosted';

function getFirefoxExtensionId() {
  const extensionId = process.env.FIREFOX_EXTENSION_ID?.trim();
  return extensionId || DEFAULT_FIREFOX_EXTENSION_ID;
}

function getFirefoxUpdateUrl() {
  const updateUrl = process.env.FIREFOX_UPDATE_URL?.trim();
  return updateUrl || undefined;
}

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.png',
  },
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';
    const firefoxUpdateUrl = getFirefoxUpdateUrl();

    return {
      name: 'SudoFill',
      description: 'Temporary identity and email extension',
      permissions: isFirefox ? ['storage', 'alarms'] : ['storage', 'alarms', 'sidePanel'],
      host_permissions: ['https://api.mail.tm/*'],
      action: {
        default_title: 'SudoFill',
        ...(isFirefox
          ? {
              default_popup: 'popup.html',
            }
          : {}),
      },
      ...(isFirefox
        ? {
            browser_action: {
              default_area: 'navbar',
            },
          }
        : {}),
      ...(isFirefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: getFirefoxExtensionId(),
                strict_min_version: '140.0',
                data_collection_permissions: {
                  required: [
                    'personallyIdentifyingInfo',
                    'personalCommunications',
                    'authenticationInfo',
                  ],
                },
                ...(firefoxUpdateUrl ? { update_url: firefoxUpdateUrl } : {}),
              },
            },
          }
        : {}),
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
