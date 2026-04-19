type FirefoxConfig = {
  gecko: {
    id?: string;
    update_url?: string;
  };
};

export const firefoxConfig: FirefoxConfig = {
  gecko: {
    // Stable Firefox add-on ID for self-distributed signed builds.
    id: 'sudofill@selfhosted',
    // Optional HTTPS update manifest for self-hosted Firefox updates.
    update_url: undefined,
  },
};
