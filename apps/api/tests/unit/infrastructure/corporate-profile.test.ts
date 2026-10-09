import { describe, expect, it } from 'vitest';

import { CORPORATE_PROFILE } from '../../../src/infrastructure/document-profile/index.js';

describe('corporate document profile (DOC-001)', () => {
  it('keeps the approved identity, contacts, social networks, tagline, and payment instructions', () => {
    expect(CORPORATE_PROFILE).toEqual({
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
    });
  });
});
