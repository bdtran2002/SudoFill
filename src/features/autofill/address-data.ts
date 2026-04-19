import { faker } from '@faker-js/faker';

const STATE_ADDRESS_SAMPLES: Record<string, Array<{ city: string; postalCode: string }>> = {
  AL: [{ city: 'Birmingham', postalCode: '35203' }],
  AK: [{ city: 'Anchorage', postalCode: '99501' }],
  AZ: [{ city: 'Phoenix', postalCode: '85004' }],
  AR: [{ city: 'Little Rock', postalCode: '72201' }],
  CA: [{ city: 'Los Angeles', postalCode: '90012' }],
  CO: [{ city: 'Denver', postalCode: '80202' }],
  CT: [{ city: 'Hartford', postalCode: '06103' }],
  DE: [{ city: 'Wilmington', postalCode: '19801' }],
  FL: [{ city: 'Miami', postalCode: '33130' }],
  GA: [{ city: 'Atlanta', postalCode: '30303' }],
  HI: [{ city: 'Honolulu', postalCode: '96813' }],
  ID: [{ city: 'Boise', postalCode: '83702' }],
  IL: [{ city: 'Chicago', postalCode: '60602' }],
  IN: [{ city: 'Indianapolis', postalCode: '46204' }],
  IA: [{ city: 'Des Moines', postalCode: '50309' }],
  KS: [{ city: 'Wichita', postalCode: '67202' }],
  KY: [{ city: 'Louisville', postalCode: '40202' }],
  LA: [{ city: 'New Orleans', postalCode: '70112' }],
  ME: [{ city: 'Portland', postalCode: '04101' }],
  MD: [{ city: 'Baltimore', postalCode: '21202' }],
  MA: [{ city: 'Boston', postalCode: '02108' }],
  MI: [{ city: 'Detroit', postalCode: '48226' }],
  MN: [{ city: 'Minneapolis', postalCode: '55401' }],
  MS: [{ city: 'Jackson', postalCode: '39201' }],
  MO: [{ city: 'Kansas City', postalCode: '64106' }],
  MT: [{ city: 'Billings', postalCode: '59101' }],
  NE: [{ city: 'Omaha', postalCode: '68102' }],
  NV: [{ city: 'Las Vegas', postalCode: '89101' }],
  NH: [{ city: 'Manchester', postalCode: '03101' }],
  NJ: [{ city: 'Newark', postalCode: '07102' }],
  NM: [{ city: 'Albuquerque', postalCode: '87102' }],
  NY: [{ city: 'New York', postalCode: '10007' }],
  NC: [{ city: 'Charlotte', postalCode: '28202' }],
  ND: [{ city: 'Fargo', postalCode: '58102' }],
  OH: [{ city: 'Columbus', postalCode: '43215' }],
  OK: [{ city: 'Oklahoma City', postalCode: '73102' }],
  OR: [{ city: 'Portland', postalCode: '97204' }],
  PA: [{ city: 'Philadelphia', postalCode: '19107' }],
  RI: [{ city: 'Providence', postalCode: '02903' }],
  SC: [{ city: 'Charleston', postalCode: '29401' }],
  SD: [{ city: 'Sioux Falls', postalCode: '57104' }],
  TN: [{ city: 'Nashville', postalCode: '37219' }],
  TX: [{ city: 'Austin', postalCode: '78701' }],
  UT: [{ city: 'Salt Lake City', postalCode: '84111' }],
  VT: [{ city: 'Burlington', postalCode: '05401' }],
  VA: [{ city: 'Richmond', postalCode: '23219' }],
  WA: [{ city: 'Seattle', postalCode: '98104' }],
  WV: [{ city: 'Charleston', postalCode: '25301' }],
  WI: [{ city: 'Milwaukee', postalCode: '53202' }],
  WY: [{ city: 'Cheyenne', postalCode: '82001' }],
};

export function getAddressSampleForState(state: string) {
  const samples = STATE_ADDRESS_SAMPLES[state];

  if (!samples?.length) {
    return null;
  }

  return faker.helpers.arrayElement(samples);
}
