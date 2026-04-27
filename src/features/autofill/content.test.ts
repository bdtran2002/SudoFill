// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { fillProfile, getTargetFormForTesting, getTargetRootForTesting } from './content';

const profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  businessName: 'Ada Labs LLC',
  email: 'ada@example.com',
  phone: '555-0100',
  password: 'P@ssw0rd123!',
  sex: 'female',
  birthDateIso: '1990-01-15',
  birthDay: '15',
  birthMonth: '01',
  birthYear: '1990',
  ageAtFill: 35,
  addressLine1: '123 Main St',
  addressLine2: 'Apt 4',
  city: 'Austin',
  state: 'TX',
  stateName: 'Texas',
  country: 'US',
  countryName: 'United States',
  postalCode: '78701',
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';

  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value() {
      return {
        0: { width: 100, height: 20 } as DOMRect,
        length: 1,
        item: (index: number) => (index === 0 ? ({ width: 100, height: 20 } as DOMRect) : null),
      } as unknown as DOMRectList;
    },
  });
});

describe('content autofill targeting', () => {
  it('prefers the richer signup form over a newsletter form', async () => {
    document.body.innerHTML = `
      <form id="newsletter" aria-label="Newsletter signup">
        <label>Email <input name="email" /></label>
        <button type="submit">Subscribe</button>
      </form>

      <form id="account" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="emailAddress" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('account');

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#newsletter input') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#account [name="firstName"]') as HTMLInputElement).value).toBe(
      'Ada',
    );
    expect((document.querySelector('#account [name="lastName"]') as HTMLInputElement).value).toBe(
      'Lovelace',
    );
    expect(
      (document.querySelector('#account [name="emailAddress"]') as HTMLInputElement).value,
    ).toBe('ada@example.com');
  });

  it('does not let a focused login form override the signup form', async () => {
    document.body.innerHTML = `
      <form id="login" aria-label="Log in">
        <label>Email <input id="login-email" name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Sign in</button>
      </form>

      <form id="register" aria-label="Register">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Date of birth <input name="dob" /></label>
        <button type="submit">Register</button>
      </form>
    `;

    const loginEmail = document.getElementById('login-email') as HTMLInputElement;
    loginEmail.focus();

    expect(document.activeElement).toBe(loginEmail);
    expect(getTargetFormForTesting(profile, document)?.id).toBe('register');

    const result = await fillProfile(profile, document);

    expect(result.filledCount).toBe(4);
    expect(loginEmail.value).toBe('');
    expect((document.querySelector('#register [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('fills first and last name fields in a signup form when the fields contain name tokens', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label for="first-name">First name</label>
        <input id="first-name" name="first_name" autocomplete="given-name" />

        <label for="last-name">Last name</label>
        <input id="last-name" name="last_name" autocomplete="family-name" />

        <label>Email</label>
        <input name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#first-name') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('#last-name') as HTMLInputElement).value).toBe('Lovelace');
    expect((document.querySelector('#signup [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('fills a business name field', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label for="business-name">Business name</label>
        <input id="business-name" name="business_name" />

        <label for="email">Email</label>
        <input id="email" name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#business-name') as HTMLInputElement).value).toBe(
      'Ada Labs LLC',
    );
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('fills password fields on signup forms when the profile includes a password', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#signup [name="password"]') as HTMLInputElement).value).toBe(
      profile.password,
    );
  });

  it('does not fill password fields on login forms', async () => {
    document.body.innerHTML = `
      <form id="login" aria-label="Log in">
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Sign in</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(false);
    expect((document.querySelector('#login [name="password"]') as HTMLInputElement).value).toBe('');
  });

  it('fills an eBay-like business signup form while keeping username blocked', async () => {
    document.body.innerHTML = `
      <form id="ebay-business" aria-label="Business account signup">
        <input id="business-name" name="businessName" placeholder="Business name" />

        <input id="business-email" name="businessEmail" placeholder="Business email" />

        <input id="username" name="username" placeholder="Username" />

        <input id="password" type="password" name="password" placeholder="Password" />

        <label for="country">Country</label>
        <select id="country" name="country">
          <option value="">Select</option>
          <option value="US">United States</option>
        </select>

        <button type="submit">Continue</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#business-name') as HTMLInputElement).value).toBe(
      'Ada Labs LLC',
    );
    expect((document.querySelector('#business-email') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
    expect((document.querySelector('#username') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#country') as HTMLSelectElement).value).toBe('US');
  });

  it('does not fill a username field', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label for="username">Username</label>
        <input id="username" name="username" />

        <label for="email">Email</label>
        <input id="email" name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#username') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('infers a manually entered username from a username-like field', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label for="username">Username</label>
        <input id="username" name="username" value="ada" />

        <label for="email">Email</label>
        <input id="email" name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect(result.inferredUsername).toBe('ada');
    expect((document.querySelector('#email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('defaults the inferred username to the email when no custom username exists', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label for="username">Username</label>
        <input id="username" name="username" />

        <label for="email">Email</label>
        <input id="email" name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect(result.inferredUsername).toBe('ada@example.com');
  });

  it('ignores prefilled usernames from a different form outside the target scope', async () => {
    document.body.innerHTML = `
      <form id="login" aria-label="Log in">
        <label for="login-username">Username</label>
        <input id="login-username" name="username" value="carryover-user" />
      </form>
      <form id="signup" aria-label="Create account">
        <label for="email">Email</label>
        <input id="email" name="email" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect(result.inferredUsername).toBe('ada@example.com');
  });

  it("fills a Wendy's-style email-first sign-in step when the page title indicates auth intent", async () => {
    document.title = "Log In | Wendy's";
    document.body.innerHTML = `
      <form id="sign-in">
        <fieldset>
          <legend><label for="email">Email Address</label></legend>
          <input id="email" type="email" name="email" />
        </fieldset>
        <label><input type="checkbox" name="stayLoggedIn" />Stay logged in</label>
        <button type="submit">Next</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('sign-in');

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect(result.filledCount).toBe(1);
    expect((document.querySelector('#sign-in [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('fills an email-first login flow when the form itself carries the login cue', async () => {
    document.body.innerHTML = `
      <form id="login" aria-label="Log in">
        <label>Email <input name="email" /></label>
        <button type="submit">Continue</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('login');

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect(result.filledCount).toBe(1);
    expect((document.querySelector('#login [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('keeps a weakly labeled password form eligible without explicit signup copy', async () => {
    document.body.innerHTML = `
      <form id="account" aria-label="Account">
        <label>First name <input name="firstName" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <label>Confirm password <input type="password" name="confirmPassword" /></label>
        <button type="submit">Continue</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('account');

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#account [name="firstName"]') as HTMLInputElement).value).toBe(
      'Ada',
    );
    expect((document.querySelector('#account [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
    expect((document.querySelector('#account [name="password"]') as HTMLInputElement).value).toBe(
      profile.password,
    );
  });

  it('does not autofill password fields on account settings forms', async () => {
    document.body.innerHTML = `
      <form id="settings" aria-label="Account settings">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Current password <input type="password" name="currentPassword" /></label>
        <label>New password <input type="password" name="newPassword" /></label>
        <button type="submit">Save changes</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('#settings [name="firstName"]') as HTMLInputElement).value).toBe(
      'Ada',
    );
    expect((document.querySelector('#settings [name="lastName"]') as HTMLInputElement).value).toBe(
      'Lovelace',
    );
    expect((document.querySelector('#settings [name="currentPassword"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#settings [name="newPassword"]') as HTMLInputElement).value).toBe('');
  });

  it('fills ungrouped fields when no form tags exist', async () => {
    document.body.innerHTML = `
      <div>
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
      </div>
    `;

    const result = await fillProfile(profile, document);

    expect(getTargetFormForTesting(profile, document)).toBeNull();
    expect(result.filledCount).toBe(3);
    expect((document.querySelector('[name="firstName"]') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('[name="lastName"]') as HTMLInputElement).value).toBe(
      'Lovelace',
    );
    expect((document.querySelector('[name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('does not prefer a contact form over account signup', async () => {
    document.body.innerHTML = `
      <form id="contact" aria-label="Contact us">
        <label>Full name <input name="fullName" /></label>
        <label>Email <input name="email" /></label>
        <textarea name="message"></textarea>
        <button type="submit">Send</button>
      </form>

      <form id="signup" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('signup');

    await fillProfile(profile, document);

    expect((document.querySelector('#contact [name="fullName"]') as HTMLInputElement).value).toBe(
      '',
    );
    expect((document.querySelector('#signup [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('targets a single ungrouped signup section on SPA-style pages', async () => {
    document.body.innerHTML = `
      <section id="contact-panel">
        <h2>Contact us</h2>
        <label>Full name <input name="fullName" /></label>
        <label>Email <input name="email" /></label>
        <button type="button">Send</button>
      </section>

      <section id="signup-panel">
        <h2>Create account</h2>
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Date of birth <input name="dob" /></label>
        <button type="button">Create account</button>
      </section>
    `;

    expect(getTargetRootForTesting(profile, document)?.id).toBe('signup-panel');

    const result = await fillProfile(profile, document);

    expect(result.filledCount).toBe(4);
    expect(
      (document.querySelector('#contact-panel [name="email"]') as HTMLInputElement).value,
    ).toBe('');
    expect(
      (document.querySelector('#signup-panel [name="firstName"]') as HTMLInputElement).value,
    ).toBe('Ada');
  });

  it('does not prefer a checkout-like form over account signup', async () => {
    document.body.innerHTML = `
      <form id="checkout" aria-label="Checkout shipping">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Address <input name="address1" /></label>
        <label>City <input name="city" /></label>
        <label>State <input name="state" /></label>
        <label>ZIP <input name="postalCode" /></label>
        <button type="submit">Continue to payment</button>
      </form>

      <form id="signup" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('signup');

    await fillProfile(profile, document);

    expect((document.querySelector('#checkout [name="email"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#signup [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('keeps plain ungrouped clusters separate', async () => {
    document.body.innerHTML = `
      <div id="contact-box">
        <h2>Contact us</h2>
        <label>Full name <input name="fullName" /></label>
        <label>Email <input name="email" /></label>
        <button type="button">Send</button>
      </div>

      <div id="signup-box">
        <h2>Create account</h2>
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <button type="button">Create account</button>
      </div>
    `;

    expect(getTargetRootForTesting(profile, document)?.id).toBe('signup-box');

    await fillProfile(profile, document);

    expect((document.querySelector('#contact-box [name="email"]') as HTMLInputElement).value).toBe(
      '',
    );
    expect((document.querySelector('#signup-box [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('does not prefer account settings over signup', async () => {
    document.body.innerHTML = `
      <form id="settings" aria-label="Account settings">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <button type="submit">Save changes</button>
      </form>

      <form id="signup" aria-label="Register">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Register</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('signup');

    await fillProfile(profile, document);

    expect((document.querySelector('#settings [name="email"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#signup [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('does not prefer a request-demo form over signup', async () => {
    document.body.innerHTML = `
      <form id="demo" aria-label="Request a demo">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Work email <input name="email" /></label>
        <button type="submit">Request a demo</button>
      </form>

      <form id="signup" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)?.id).toBe('signup');

    await fillProfile(profile, document);

    expect((document.querySelector('#demo [name="email"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#signup [name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('does not autofill a lead-gen form when it is the only candidate', async () => {
    document.body.innerHTML = `
      <form id="sales" aria-label="Contact sales">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <button type="submit">Talk to sales</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)).toBeNull();

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(false);
    expect(result.filledCount).toBe(0);
    expect((document.querySelector('#sales [name="email"]') as HTMLInputElement).value).toBe('');
  });

  it('does not treat a newsletter form as an auth step just because the page title is login-ish', async () => {
    document.title = 'Log In | Example';
    document.body.innerHTML = `
      <form id="newsletter" aria-label="Newsletter signup">
        <label>Email <input name="email" /></label>
        <button type="submit">Subscribe</button>
      </form>
    `;

    expect(getTargetFormForTesting(profile, document)).toBeNull();

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(false);
    expect(result.filledCount).toBe(0);
    expect((document.querySelector('#newsletter [name="email"]') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('matches fields identified through aria-labelledby text', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <span id="first-name-label">First name</span>
        <input name="given" aria-labelledby="first-name-label" />

        <span id="email-label">Email address</span>
        <input name="contact" aria-labelledby="email-label" />

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="given"]') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('[name="contact"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('matches fields identified by nearby wrapper text even without label tags', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <div class="field-row">
          <div>First name</div>
          <div><input name="given" /></div>
        </div>

        <div class="field-row">
          <div>Email address</div>
          <div><input name="contact" /></div>
        </div>

        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="given"]') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('[name="contact"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });

  it('uses fieldset legend context for split dob fields', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Register">
        <fieldset>
          <legend>Date of birth</legend>
          <input name="month" />
          <input name="day" />
          <input name="year" />
        </fieldset>

        <button type="submit">Register</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="month"]') as HTMLInputElement).value).toBe('01');
    expect((document.querySelector('[name="day"]') as HTMLInputElement).value).toBe('15');
    expect((document.querySelector('[name="year"]') as HTMLInputElement).value).toBe('1990');
  });

  it('uses nearby grouping text for split dob fields outside fieldsets', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Register">
        <div aria-label="Date of birth">
          <label>Month <input name="month" /></label>
          <label>Day <input name="day" /></label>
          <label>Year <input name="year" /></label>
        </div>

        <button type="submit">Register</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="month"]') as HTMLInputElement).value).toBe('01');
    expect((document.querySelector('[name="day"]') as HTMLInputElement).value).toBe('15');
    expect((document.querySelector('[name="year"]') as HTMLInputElement).value).toBe('1990');
  });

  it('fills country and state selects using United States and California defaults', async () => {
    const defaultLocationProfile = {
      ...profile,
      state: 'CA',
      stateName: 'California',
      country: 'US',
      countryName: 'United States',
    };

    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>
          Country
          <select name="country">
            <option value="">Select</option>
            <option value="America">America</option>
            <option value="Canada">Canada</option>
          </select>
        </label>
        <label>
          State
          <select name="state">
            <option value="">Select</option>
            <option value="NV">Nevada</option>
            <option value="CA">California</option>
          </select>
        </label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(defaultLocationProfile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="country"]') as HTMLSelectElement).value).toBe('America');
    expect((document.querySelector('[name="state"]') as HTMLSelectElement).value).toBe('CA');
  });

  it('fills a dependent state select that appears after country selection', async () => {
    const dependentLocationProfile = {
      ...profile,
      state: 'CA',
      stateName: 'California',
      country: 'US',
      countryName: 'United States',
    };

    document.body.innerHTML = `
      <form id="login" aria-label="Log in">
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Sign in</button>
      </form>

      <form id="signup" aria-label="Create account">
        <label>First name <input name="firstName" /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" /></label>
        <label>
          Country
          <select name="country" id="country">
            <option value="">Select</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </label>
        <div id="state-container"></div>
        <label>Postal code <input name="postalCode" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    const country = document.getElementById('country') as HTMLSelectElement;
    country.addEventListener('change', () => {
      if (country.value !== 'US' || document.querySelector('[name="state"]')) return;

      setTimeout(() => {
        document.getElementById('state-container')!.innerHTML = `
          <label>
            State
            <select name="state">
              <option value="">Select</option>
              <option value="CA">California</option>
              <option value="NV">Nevada</option>
            </select>
          </label>
        `;
      }, 0);
    });

    const result = await fillProfile(dependentLocationProfile, document);

    expect(result.ok).toBe(true);
    expect(result.filledCount).toBe(6);
    expect((document.querySelector('#login [name="email"]') as HTMLInputElement).value).toBe('');
    expect(country.value).toBe('US');
    expect((document.querySelector('[name="state"]') as HTMLSelectElement).value).toBe('CA');
  });

  it('fills short first and last labels that do not include the word name', async () => {
    document.body.innerHTML = `
      <form id="signup" aria-label="Create account">
        <label>First <input name="first" /></label>
        <label>Last <input name="last" /></label>
        <label>Email <input name="email" /></label>
        <label>Password <input type="password" name="password" /></label>
        <button type="submit">Create account</button>
      </form>
    `;

    const result = await fillProfile(profile, document);

    expect(result.ok).toBe(true);
    expect((document.querySelector('[name="first"]') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('[name="last"]') as HTMLInputElement).value).toBe('Lovelace');
    expect((document.querySelector('[name="email"]') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
  });
});
