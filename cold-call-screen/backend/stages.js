// Stage definitions. The backend serves these at GET /stages.
//
// PLACEHOLDER CONTENT. Replace the name, purpose and typical_prospect_says
// for each stage with what you took from the structure page and the 100
// transcripts. Keep exactly eight entries, numbered 1 to 8.

export const STAGES = [
  {
    no: 1,
    name: 'Opening',
    purpose: 'Say who you are and ask for thirty seconds.',
    typical_prospect_says: ['Who is this?', 'I am in a meeting.', 'Yes, go ahead, quickly.'],
  },
  {
    no: 2,
    name: 'Reason for calling',
    purpose: 'One line on why you are calling, tied to their role.',
    typical_prospect_says: ['What is this about?', 'We already have someone for that.', 'Send me an email.'],
  },
  {
    no: 3,
    name: 'Current situation',
    purpose: 'Ask how they handle this area today.',
    typical_prospect_says: ['We do it in-house.', 'It works fine for now.', 'Our team handles it.'],
  },
  {
    no: 4,
    name: 'Problem and impact',
    purpose: 'Find out what it costs them when it goes wrong.',
    typical_prospect_says: ['Sometimes it slips.', 'It is a headache at month end.', 'We lose time on it.'],
  },
  {
    no: 5,
    name: 'Value',
    purpose: 'Connect one thing you do to the problem they named.',
    typical_prospect_says: ['How exactly does that work?', 'We tried something similar before.', 'What does it cost?'],
  },
  {
    no: 6,
    name: 'Objections',
    purpose: 'Handle the most likely pushback without arguing.',
    typical_prospect_says: ['Not interested.', 'Budget is frozen.', 'Call me next quarter.'],
  },
  {
    no: 7,
    name: 'Proof',
    purpose: 'Share one short, relevant example.',
    typical_prospect_says: ['Who else uses it?', 'Is that a real example?', 'Do you have a case study?'],
  },
  {
    no: 8,
    name: 'Next step',
    purpose: 'Ask for one specific next step with a time.',
    typical_prospect_says: ['Maybe, send details.', 'Tuesday works.', 'I will think about it.'],
  },
];
