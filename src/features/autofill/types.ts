export type AutofillSex = '' | 'female' | 'male' | 'nonbinary';

export interface AutofillSettings {
  generateAddress: boolean;
  state: string;
  sex: AutofillSex;
  ageMin: string;
  ageMax: string;
}

export interface GeneratedProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  sex: Exclude<AutofillSex, ''> | 'unspecified';
  birthDateIso: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateName: string;
  postalCode: string;
}

export interface AutofillContentRequest {
  type: 'autofill:fill-profile';
  profile: GeneratedProfile;
}

export interface AutofillContentResponse {
  ok: boolean;
  filledCount: number;
  fields: string[];
  error?: string;
}
