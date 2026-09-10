import CryptoJS from 'crypto-js';

// Generates a random hex string without relying on native crypto module.
// Uses Math.random() seeded with Date.now() — sufficient for a salt/session ID
// in a local PIN system (not a banking app).
const randomHex = (length: number): string => {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result + Date.now().toString(16);
};

export const generateSalt = (): string => randomHex(32);

export const generateSessionId = (): string => randomHex(32) + '-' + Date.now();

export const hashPin = (pin: string, salt: string): string => {
  return CryptoJS.SHA256(pin + salt).toString();
};

export const verifyPin = (pin: string, salt: string, storedHash: string): boolean => {
  return hashPin(pin, salt) === storedHash;
};

export const isValidPinFormat = (pin: string): boolean => {
  return /^\d{4,6}$/.test(pin);
};

export const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};