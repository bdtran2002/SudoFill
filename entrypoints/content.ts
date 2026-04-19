import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';
import { fillProfile } from '../src/features/autofill/content';

function isGeneratedProfile(value: unknown): value is GeneratedProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return [
    'firstName',
    'lastName',
    'fullName',
    'businessName',
    'email',
    'phone',
    'sex',
    'birthDateIso',
    'birthDay',
    'birthMonth',
    'birthYear',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'stateName',
    'country',
    'countryName',
    'postalCode',
  ].every((key) => typeof profile[key] === 'string');
}

export default defineContentScript({
  matches: ['https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener(
      (
        message: AutofillContentRequest,
        _sender,
        sendResponse: (response: AutofillContentResponse) => void,
      ) => {
        if (message.type !== 'autofill:fill-profile') {
          return false;
        }

        if (!isGeneratedProfile(message.profile)) {
          sendResponse({
            ok: false,
            filledCount: 0,
            fields: [],
            error: 'Malformed autofill profile payload.',
            reason: 'payload',
          });
          return true;
        }

        void (async () => {
          try {
            sendResponse(await fillProfile(message.profile));
          } catch (error) {
            sendResponse({
              ok: false,
              filledCount: 0,
              fields: [],
              error: error instanceof Error ? error.message : 'Autofill failed on this page.',
              reason: 'runtime',
            });
          }
        })();
        return true;
      },
    );
  },
});
