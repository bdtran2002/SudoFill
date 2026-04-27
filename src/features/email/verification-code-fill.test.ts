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
    expect(scoreVerificationCodeField(input)).toBeGreaterThan(30);
  });

  it('does not fill generic code fields without strong verification cues', () => {
    document.body.innerHTML = `
      <form>
        <label>Email <input id="email" type="email" /></label>
        <label>Code <input id="code" type="text" /></label>
      </form>
    `;

    expect(fillVerificationCode('NBW-VOW')).toBe(false);
    expect((document.getElementById('code') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('accepts autocomplete one-time-code fields even with minimal labels', () => {
    document.body.innerHTML = `
      <label for="code-box">Code</label>
      <input id="code-box" type="text" autocomplete="one-time-code" />
    `;

    expect(fillVerificationCode('123456')).toBe(true);
    expect((document.getElementById('code-box') as HTMLInputElement).value).toBe('123456');
  });

  it('detects segmented otp inputs from nearby group text', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Enter security code</legend>
        <div class="otp-grid">
          <input id="digit-1" type="text" inputmode="numeric" />
          <input id="digit-2" type="text" inputmode="numeric" />
          <input id="digit-3" type="text" inputmode="numeric" />
          <input id="digit-4" type="text" inputmode="numeric" />
        </div>
      </fieldset>
    `;

    expect(fillVerificationCode('1234')).toBe(true);
    expect((document.getElementById('digit-1') as HTMLInputElement).value).toBe('1');
    expect((document.getElementById('digit-2') as HTMLInputElement).value).toBe('2');
    expect((document.getElementById('digit-3') as HTMLInputElement).value).toBe('3');
    expect((document.getElementById('digit-4') as HTMLInputElement).value).toBe('4');
  });

  it('does not qualify generic code fields without verification cues', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Code entry</legend>
        <input id="code-box" type="text" />
      </fieldset>
    `;

    expect(fillVerificationCode('1234')).toBe(false);
  });
});
