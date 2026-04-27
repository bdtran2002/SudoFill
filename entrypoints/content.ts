import type {
  AutofillContentRequest,
  AutofillContentResponse,
  GeneratedProfile,
} from '../src/features/autofill/types';
import { fillProfile } from '../src/features/autofill/content';
import { fillVerificationCode } from '../src/features/email/verification-code-fill';
import type { VerificationPopupPayload } from '../src/features/email/verification-popup';
import type { VerificationContentCommand } from '../src/features/email/types';

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
        message: AutofillContentRequest | VerificationPopupRequest | VerificationContentCommand,
        _sender,
        sendResponse: (
          response: AutofillContentResponse | { ok: boolean; error?: string },
        ) => void,
      ) => {
        if (message.type === 'verification:fill-code') {
          const didFill = fillVerificationCode(message.code);
          sendResponse({ ok: didFill });
          return true;
        }

        if (message.type !== 'autofill:fill-profile') {
          if (message.type !== 'verification:show-popup') {
            return false;
          }

          void showVerificationPopup(message.payload)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => {
              console.error('showVerificationPopup failed', error);
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            });
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
  rootHost.style.top = '16px';
  rootHost.style.left = '16px';
  rootHost.style.right = 'auto';
  rootHost.style.width = 'min(360px, calc(100vw - 32px))';
  rootHost.style.zIndex = '2147483647';

  const shadow = rootHost.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      :host {
        color: #ede8e4;
        font-family: 'Figtree', 'Segoe UI', sans-serif;
      }
      .card {
        overflow: hidden;
        border: 1px solid #353030;
        border-radius: 16px;
        background:
          radial-gradient(circle at top right, rgba(239, 75, 75, 0.12), transparent 42%),
          linear-gradient(180deg, rgba(36, 33, 33, 0.96), rgba(26, 24, 24, 0.98)), #1a1818;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.38);
      }
      .shell { padding: 14px; }
      .top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .sender {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #9a9290;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .subject {
        margin-top: 6px;
        font-family: 'Fraunces', Georgia, serif;
        font-size: 17px;
        line-height: 1.2;
        font-weight: 700;
        color: #ede8e4;
      }
      .actions { display: grid; gap: 8px; margin-top: 14px; }
      button, a {
        appearance: none;
        border: 0;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        padding: 10px 12px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease,
          transform 150ms ease;
      }
      .primary {
        background: #ef4b4b;
        color: white;
        box-shadow: 0 10px 24px rgba(239, 75, 75, 0.22);
      }
      .primary:hover { background: #dc3c3c; }
      .secondary {
        background: #242121;
        color: #ede8e4;
        border: 1px solid #353030;
      }
      .secondary:hover {
        border-color: rgba(239, 75, 75, 0.45);
        color: #ef4b4b;
      }
      .dismiss {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: #242121;
        border: 1px solid #353030;
        color: #9a9290;
        padding: 0;
        font-size: 18px;
        line-height: 1;
        flex: 0 0 auto;
      }
      .dismiss:hover {
        border-color: rgba(239, 75, 75, 0.45);
        color: #ef4b4b;
      }
      .code {
        margin-top: 12px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid #353030;
        background: #242121;
      }
      .codeMeta { min-width: 0; }
      .codeLabel {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #5c5755;
      }
      .codeValue {
        margin-top: 4px;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #ede8e4;
        word-break: break-word;
      }
    </style>
    <div class="card">
      <div class="shell">
        <div class="top">
          <div>
            <div class="sender"></div>
            <div class="subject"></div>
          </div>
          <button class="dismiss" aria-label="Dismiss">×</button>
        </div>
        <div class="actions"></div>
        <div class="code" hidden>
          <div class="codeMeta">
            <div class="codeLabel"></div>
            <div class="codeValue"></div>
          </div>
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <button class="secondary fill">Use code</button>
            <button class="secondary copy">Copy code</button>
          </div>
        </div>
      </div>
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
      void chrome.runtime
        .sendMessage({ type: 'mailbox:open-link', url: payload.link?.url })
        .catch(() => {
          window.open(payload.link?.url, '_blank', 'noopener,noreferrer');
        });
      rootHost.remove();
    });
    actions.appendChild(link);
  }
  if (payload.code) {
    const codeRow = shadow.querySelector('.code') as HTMLElement;
    codeRow.hidden = false;
    shadow.querySelector('.codeLabel')!.textContent = payload.code.label;
    shadow.querySelector('.codeValue')!.textContent = payload.code.code;
    shadow.querySelector('.fill')!.addEventListener('click', async () => {
      const didFill = fillVerificationCode(payload.code!.code);
      if (didFill) {
        rootHost.remove();
      }
    });
    shadow.querySelector('.copy')!.addEventListener('click', async () => {
      await navigator.clipboard.writeText(payload.code!.code);
    });
  }

  shadow.querySelector('.dismiss')!.addEventListener('click', () => rootHost.remove());
}
