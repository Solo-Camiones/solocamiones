import type { CorporateProfile } from './types.js';

export const CORPORATE_PROFILE: CorporateProfile = {
  legalName: 'SOLO CAMIONES',
  rnc: '1-33-13562-2',
  address: 'Av. Pdte. Antonio Guzmán Fernández #68, próximo al Aerop. El Higüero',
  whatsApp: '809-875-3161 / 829-627-3168',
  email: 'solocamionessrl@gmail.com',
  tagline: 'Importadora de repuestos nuevos y usados',
  social: {
    instagram: '@solocamionessrl',
    facebook: 'Solo Camiones SRL',
    tiktok: 'solo.camiones.srl',
  },
  payment: {
    transfer: {
      bankName: 'Banco Popular Dominicano',
      accountType: 'Cuenta Corriente DOP',
      accountNumber: '857578579',
      accountHolder: 'Solo Camiones SRL',
    },
    chequePayee: 'Solo Camiones SRL',
  },
};
