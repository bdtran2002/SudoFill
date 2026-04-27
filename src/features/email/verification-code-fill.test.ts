// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { fillVerificationCode, scoreVerificationCodeField } from './verification-code-fill';

describe('verification code fill', () => {
  it('prefers labelled verification fields over generic inputs', () => {
    document.body.innerHTML = `
      <form>
        <label>Email <input id="email" type="email" /></label>
        <label>Verification code <input id="otp" type="text" /></label>
      </form>
    `;

    expect(fillVerificationCode('NBW-VOW')).toBe(true);
    expect((document.getElementById('otp') as HTMLInputElement).value).toBe('NBW-VOW');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('fills textarea targets when they are the best candidate', () => {
    document.body.innerHTML = `
      <label for="code-box">One-time code</label>
      <textarea id="code-box"></textarea>
    `;

    expect(fillVerificationCode('123456')).toBe(true);
    expect((document.getElementById('code-box') as HTMLTextAreaElement).value).toBe('123456');
  });

  it('scores associated labels as verification cues', () => {
    document.body.innerHTML = `
      <label for="code-box">Security code</label>
      <input id="code-box" type="text" />
    `;

    const input = document.getElementById('code-box') as HTMLInputElement;
    expect(scoreVerificationCodeField(input, /code/i)).toBeGreaterThan(30);
  });
});
