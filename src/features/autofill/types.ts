export type AutofillSex = '' | 'female' | 'male' | 'nonbinary';

export interface AutofillSettings {
  generateAddress: boolean;
  showVerificationAssistPopup: boolean;
  saveUsageHistory: boolean;
  saveUsageHistoryDetails: {
    name: boolean;
    age: boolean;
    address: boolean;
  };
  state: string;
  sex: AutofillSex;
  ageMin: string;
  ageMax: string;
}

export interface GeneratedProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  sex: Exclude<AutofillSex, ''> | 'unspecified';
  birthDateIso: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  ageAtFill: number;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateName: string;
  country: string;
  countryName: string;
  postalCode: string;
}

export interface AutofillContentRequest {
  type: 'autofill:fill-profile';
  profile: GeneratedProfile;
}

export type AutofillFailureReason = 'no-fields' | 'payload' | 'runtime';

export interface AutofillContentResponse {
  ok: boolean;
  filledCount: number;
  fields: string[];
  inferredUsername?: string;
  error?: string;
  reason?: AutofillFailureReason;
}

export interface AutofillUsageHistoryEntry {
  id: string;
  createdAt: string;
  siteHostname: string;
  siteUrl: string;
  email: string;
  username: string;
  fullName: string;
  firstName: string;
  lastName: string;
  age: number;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}
