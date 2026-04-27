import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';
import { fillProfile } from '../src/features/autofill/content';
import type { VerificationPopupPayload } from '../src/features/email/verification-popup';

type VerificationPopupRequest = {
  type: 'verification:show-popup';
  payload: VerificationPopupPayload;
};

function isGeneratedProfile(value: unknown): value is GeneratedProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return [
    'firstName',
    'lastName',
    'fullName',
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
    'postalCode',
  ].every((key) => typeof profile[key] === 'string');
}

export default defineContentScript({
  matches: ['https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener(
      (
        message: AutofillContentRequest | VerificationPopupRequest,
        _sender,
        sendResponse: (response: AutofillContentResponse | { ok: true }) => void,
      ) => {
        if (message.type !== 'autofill:fill-profile') {
          if (message.type !== 'verification:show-popup') {
            return false;
          }

          void showVerificationPopup(message.payload).then(() => sendResponse({ ok: true }));
          return true;
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

async function showVerificationPopup(payload: VerificationPopupPayload) {
  document.getElementById('sudofill-verification-popup')?.remove();

  const host = document.documentElement;
  const rootHost = document.createElement('div');
  rootHost.id = 'sudofill-verification-popup';
  rootHost.style.all = 'initial';
  rootHost.style.position = 'fixed';
  rootHost.style.top = '12px';
  rootHost.style.left = '12px';
  rootHost.style.zIndex = '2147483647';

  const shadow = rootHost.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
      .card { width: 300px; background: #111827; color: #f9fafb; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.28); padding: 12px; }
      .top { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
      .sender { font-size: 12px; color: #93c5fd; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .subject { margin-top: 4px; font-size: 13px; line-height: 1.35; font-weight: 600; }
      .actions { display: flex; gap: 8px; margin-top: 10px; }
      button, a { appearance: none; border: 0; border-radius: 8px; font-size: 12px; font-weight: 600; padding: 8px 10px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
      .primary { background: #2563eb; color: white; flex: 1; }
      .secondary { background: rgba(255,255,255,.1); color: #f9fafb; }
      .dismiss { background: transparent; color: #9ca3af; padding: 0 4px; font-size: 16px; line-height: 1; }
      .code { margin-top: 8px; display: flex; justify-content: space-between; gap: 8px; align-items: center; color: #d1d5db; font-size: 12px; }
      .codeValue { font-family: ui-monospace, SFMono-Regular, monospace; letter-spacing: .08em; }
    </style>
    <div class="card">
      <div class="top">
        <div>
          <div class="sender"></div>
          <div class="subject"></div>
        </div>
        <button class="dismiss" aria-label="Dismiss">×</button>
      </div>
      <div class="actions"></div>
      <div class="code" hidden><span class="codeValue"></span><button class="secondary copy">Copy code</button></div>
    </div>`;
  shadow.appendChild(container);
  host.appendChild(rootHost);

  shadow.querySelector('.sender')!.textContent = payload.senderLabel;
  shadow.querySelector('.subject')!.textContent = payload.subject;

  const actions = shadow.querySelector('.actions')!;
  if (payload.link) {
    const link = document.createElement('a');
    link.className = 'primary';
    link.textContent = payload.link.label;
    link.href = payload.link.url;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void chrome.runtime.sendMessage({ type: 'mailbox:open-link', url: payload.link?.url }).catch(() => {
        window.open(payload.link?.url, '_blank', 'noopener,noreferrer');
      });
      rootHost.remove();
    });
    actions.appendChild(link);
  }
  if (payload.code) {
    const codeRow = shadow.querySelector('.code') as HTMLElement;
    codeRow.hidden = false;
    shadow.querySelector('.codeValue')!.textContent = payload.code.code;
    shadow.querySelector('.copy')!.addEventListener('click', async () => {
      await navigator.clipboard.writeText(payload.code!.code);
    });
  }

  shadow.querySelector('.dismiss')!.addEventListener('click', () => rootHost.remove());
}
