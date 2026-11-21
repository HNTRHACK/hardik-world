/*
 * About / Contact / Wins content. Every line is taken from the classic site
 * (hardik-build-log.vercel.app). Skills are the classic site's "Toolbox",
 * regrouped into Languages / Frontend / Backend / AI-ML / Web3 (no additions).
 */

export const PROFILE = {
  name: 'Hardik Bhatia',
  headline: 'Full-Stack & AI Developer',
  school: 'K.J. Somaiya School of Engineering',
  degree: 'B.E. Computer Engineering',
  university: 'Somaiya Vidyavihar University',
  years: '2024 – 2028',
  city: 'Mumbai, India',
  availability: 'Open to internships — Summer 2027',
  summary:
    'Full-stack & AI developer building payments that hide the crypto, models that keep patient data at home, and products that work in the languages people actually speak.',
  /** The same line in first person, for the About panel. */
  summaryFirstPerson:
    'I build payments that hide the crypto, models that keep patient data at home, and products that work in the languages people actually speak.',
  bio: [
    'I’m a third-year Computer Engineering student at K.J. Somaiya School of Engineering, Mumbai. At ETHGlobal Mumbai 2026 I built three projects: OMEN, ChaiPay and CareSeal. Before that came Mind Mates at Mumbai Hacks and a team entry at Smart India Hackathon.',
    'I like work where honesty is part of the spec: a dashboard where every metric traces back to data, a payment flow that says out loud which parts are a demo. Away from the editor I’m Joint Operations & PR Head at CSI KJSSE, running events for 400+ people at a time.',
  ],
  skills: [
    { group: 'Languages', items: ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C', 'SQL', 'Solidity'] },
    { group: 'Frontend', items: ['React', 'Next.js', 'three.js', 'Figma'] },
    { group: 'Backend', items: ['Node.js', 'Express', 'NestJS', 'FastAPI', 'Socket.IO', 'PostgreSQL', 'Prisma', 'Supabase', 'MongoDB', 'Docker', 'Git'] },
    { group: 'AI / ML', items: ['PyTorch', 'Opacus', 'Federated learning', 'LLMs', 'RAG', 'NLP', 'OpenAI API', 'Gemini API', 'Pandas'] },
    { group: 'Web3', items: ['Solidity', 'EVM', 'EIP-712', 'EIP-3009', 'Foundry', 'Hardhat', 'ethers.js', 'Chainlink CRE'] },
  ],
  experience: [
    { when: '2026 — Now', org: 'CSI KJSSE', role: 'Joint Operations & PR Head', line: 'Leading operations across 5 functions with a team of 43+; events for 400+ attendees.' },
    { when: 'Nov 2025', org: 'Mumbai Hacks', role: 'AI Developer: Mind Mates', line: 'A full-stack AI platform, idea to live in 24 hours.' },
    { when: 'May — Jul 2025', org: 'SWDC, KJSSE', role: 'Frontend Developer: Virtual Lab', line: 'React interfaces for online engineering experiments.' },
  ],
  certification: { year: '2026', title: 'Financial Markets', by: 'Yale University (Coursera)' },
  email: 'hardik.bhatia@somaiya.edu',
  github: 'https://github.com/HNTRHACK',
  githubHandle: 'HNTRHACK',
  linkedin: 'https://linkedin.com/in/hardik-bhatia',
  classic: 'https://hardik-build-log.vercel.app',
} as const;

export interface Win {
  year: string;
  event: string;
  /** Clipping headline: a plain restatement of the fact below. */
  headline: string;
  fact: string;
}

export const WINS: Win[] = [
  {
    year: '2026',
    event: 'ETHGlobal Mumbai',
    headline: 'Selected for ETHGlobal Mumbai',
    fact: 'Selected for the 36-hour Ethereum hackathon (500+ builders). Built OMEN, ChaiPay and CareSeal.',
  },
  {
    year: '2026',
    event: 'BigD Datathon',
    headline: 'Frontend lead on ORION',
    fact: 'Frontend lead on ORION, AI traffic forecasting for Mumbai.',
  },
  {
    year: '2025',
    event: 'Mumbai Hacks',
    headline: 'Mind Mates shipped in 24 hours',
    fact: 'Shipped Mind Mates, a full-stack AI platform, in 24 hours.',
  },
  {
    year: '2024',
    event: 'Smart India Hackathon',
    headline: 'Pitched at the national hackathon',
    fact: 'Built and pitched a solution to a real-world problem statement at India’s national hackathon.',
  },
];
