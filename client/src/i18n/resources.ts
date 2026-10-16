// Translation registry: one JSON file per namespace and language under ./locales/<lng>/<ns>.json.
// Add a namespace by importing its three files here (English is the fallback for missing keys).
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';
import arCommon from './locales/ar/common.json';

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
  ar: { common: arCommon },
} as const;

export const NAMESPACES = ['common'] as const;
