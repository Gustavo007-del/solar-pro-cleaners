export const legalDocuments = {
  privacy: {
    title: 'legal.privacy',
    sections: [
      'privacyIntro', 'collection', 'contactData', 'location', 'bookingData', 'use', 'storage',
      'sharing', 'security', 'rights', 'deletion', 'contact', 'policyUpdates',
    ],
  },
  terms: {
    title: 'legal.terms',
    sections: [
      'termsIntro', 'service', 'requests', 'confirmation', 'serviceLocation', 'responsibilities',
      'scheduling', 'cancellation', 'pricing', 'limitations', 'communication', 'termsUpdates', 'contact',
    ],
  },
  dataUsage: {
    title: 'legal.dataUsage',
    sections: ['collection', 'location', 'storage', 'external', 'deletion'],
  },
} as const;
