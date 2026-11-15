const PHONE_NUMBER = "+5491100000000";

export function phoneLabel(): string {
  return PHONE_NUMBER;
}

export function phoneHref(): string {
  return `tel:${PHONE_NUMBER}`;
}

export function smsHref(): string {
  return `sms:${PHONE_NUMBER}`;
}
