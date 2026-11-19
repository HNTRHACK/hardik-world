/*
 * Project content for the stall panels. Every fact here is taken from the
 * classic site (hardik-build-log.vercel.app/work/*) and the linked repos.
 * Nothing is invented: if a field is unknown it is left out.
 *
 * Screenshots live in /public/projects/<id>/. Files named *.svg are designed
 * placeholders: drop a real screenshot in and update `src` below.
 */

export interface Shot {
  src: string;
  alt: string;
  caption: string;
  placeholder?: boolean;
}

export interface Section {
  heading: string;
  body: string[];
}

export interface Project {
  id: string;
  /** Which plot (layout.ts) holds this stall. */
  plot: string;
  /** What the stall is in the street. */
  stall: string;
  title: string;
  /** Short name for labels and menus. */
  short: string;
  context: string;
  team: 'Solo' | 'Team';
  year: number;
  oneLiner: string;
  role: string;
  stack: string[];
  links: { live?: string; github?: string; classic: string };
  shots: Shot[];
  /** Editor's note: what is demo / not real. */
  note?: string;
  details: Section[];
}

export const PROJECTS: Project[] = [
  {
    id: 'chaipay',
    plot: 'chaipay',
    stall: 'Chai stall',
    title: 'ChaiPay',
    short: 'ChaiPay',
    context: 'ETHGlobal Mumbai 2026 · Whitechain + Chainlink CRE tracks',
    team: 'Solo',
    year: 2026,
    oneLiner: 'Scan any UPI QR, pay in USDT. The chai wala gets rupees.',
    role: 'Solo build: the escrow contract, the gasless relayer, the phone app, the Chainlink CRE verifier workflow and the Chai Nagar 3D world.',
    stack: ['Solidity', 'EIP-712', 'Node.js relayer', 'Chainlink CRE', 'JavaScript', 'three.js'],
    links: { github: 'https://github.com/HNTRHACK/chaipay', classic: 'https://hardik-build-log.vercel.app/work/chaipay/' },
    shots: [
      { src: '/projects/chaipay/1.webp', alt: 'Chai Nagar title screen: a small illustrated planet with a Start button', caption: 'Chai Nagar: walk around, buy chai, pay in USDT. The shop gets rupees.' },
      { src: '/projects/chaipay/2.webp', alt: 'Raju’s chai stall in Chai Nagar after a payment lands', caption: 'Raju’s stall after the payment settles.' },
    ],
    note: 'A prototype, not a licensed payment service. The stage demo trusts an allowlisted partner’s attested payout reference, and Whitechain isn’t a CRE network yet, so the verifier role is an oracle key running the same check.',
    details: [
      {
        heading: 'The story',
        body: [
          'India has 600M+ UPI users and every tea stall has a QR on the counter, yet people holding stablecoins still can’t buy a ₹20 chai with them. ChaiPay lets you scan the same UPI QR everyone already uses and approve the payment with no gas and no seed phrase. The shop receives rupees like any other UPI payment, and never needs to know crypto exists.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'The payer signs an EIP-712 Pay intent and a relayer submits it, paying the gas. The USDT moves from the payer’s balance into escrow.',
          'A cash partner claims the order within a ten-minute window, pays the chai wala ₹20 over UPI and reports the payout reference.',
          'A Chainlink CRE workflow re-checks that payout on every DON node, reaches consensus on the order and the payout hash, and writes a signed report to the contract. Only then is the partner paid back, minus a 0.5% fee. If nobody claims in time, anyone can trigger a refund.',
        ],
      },
      {
        heading: 'Outcome',
        body: [
          'The contract is deployed and verified on Whitechain Sepolia, with its first USDT payment settled in the main flow.',
          '22 contract tests including a fuzz test, plus 6 CRE workflow tests on Chainlink’s own test runtime.',
        ],
      },
      {
        heading: 'What I learned',
        body: ['Escrow is a trust machine. Most of the design work was deciding who is allowed to be wrong, and making sure the money still ends up somewhere sensible when they are.'],
      },
    ],
  },
  {
    id: 'omen',
    plot: 'omen',
    stall: 'Courier depot',
    title: 'OMEN: The Last Block',
    short: 'OMEN',
    context: 'ETHGlobal Mumbai 2026',
    team: 'Solo',
    year: 2026,
    oneLiner: 'A multiplayer story game with a real, gasless stablecoin checkout built in.',
    role: 'Solo build: the three.js game, the Solidity checkout contract, the Node payment gateway and relayer, the Socket.IO multiplayer layer and the merchant ledger.',
    stack: ['JavaScript', 'Solidity', 'Python', 'Node.js', 'WebSockets', 'Whitechain (EVM)'],
    links: { live: 'https://omen-mauve.vercel.app', github: 'https://github.com/HNTRHACK/OMEN', classic: 'https://hardik-build-log.vercel.app/work/omen/' },
    shots: [
      { src: '/projects/omen/1.webp', alt: 'The courier KAI standing at Maya’s tea stall in the village of Blockhaven', caption: 'Maya’s tea stall: a festival order has been “pending” since dawn.' },
      { src: '/projects/omen/2.webp', alt: 'The checkout quote dialog over the game, listing amount, fee, rate and a safety check', caption: 'The quote: what the merchant receives, the fee and the rate, with a safety check before approving.' },
      { src: '/projects/omen/3.webp', alt: 'Maya’s merchant ledger listing a confirmed masala chai payment', caption: 'Maya’s ledger on a second device, updated as the gateway verifies a payment (local fork).' },
    ],
    note: 'Payments use Whitechain Sepolia test USDT, which has no monetary value. The INR amount is a quoted equivalent: no rupees move, and OMEN never generates a bank receipt or payout reference.',
    details: [
      {
        heading: 'The story',
        body: [
          'You are KAI, a courier on a tiny planet. In the village of Blockhaven, Maya’s tea stall has a problem: a customer’s payment for forty cups of festival chai has been pending since dawn. You follow the receipt to Orin, the relay engineer, relight the plaza’s network lantern and carry his findings back to Maya.',
          'Inside that story sits a real checkout: scan the UPI QR on Maya’s sign and pay in Whitechain Sepolia test USDT with one wallet signature and no gas.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'The payer never sends a transaction. They sign one EIP-3009 ReceiveWithAuthorization for exactly the quoted USDT, made out to the checkout contract, with a nonce derived from the order itself. That signature can only settle that one order.',
          'The merchant’s relayer submits it and pays the gas. The gateway then reads the receipt back from Whitechain and checks the contract, the Paid event’s order, merchant, payer and amount before it calls anything paid.',
          'Multiplayer runs on Socket.IO rooms joined by invite link. Others see what you do (“Ravi paid Maya”) but never balances, amounts or addresses.',
        ],
      },
      {
        heading: 'Outcome',
        body: [
          '68 Node tests and 18 Solidity tests cover UPI attacks, money maths, every payment state and the gasless relay with real signatures.',
          'Gasless checkout and refunds were tested against the real test-USDT contract on a fork of live Whitechain Sepolia.',
        ],
      },
      {
        heading: 'What I learned',
        body: ['The most valuable screen in the game is the one that says what isn’t real. Being precise about the demo, rather than vague about the product, is what made the real parts believable.'],
      },
    ],
  },
  {
    id: 'federated-clinical',
    plot: 'clinic',
    stall: 'Clinic',
    title: 'Federated Clinical Platform',
    short: 'Federated Clinical',
    context: 'Team project · 2026',
    team: 'Team',
    year: 2026,
    oneLiner: 'Hospitals train models together, while patient data never leaves the hospital.',
    role: 'A team build. I built the federated learning and differential-privacy pipeline: FedAvg and DP-FedAvg aggregation with Opacus, the COVID-19 admission-time mortality model, per-hospital data partitioning and the pipeline’s tests. The backend and dashboards are the team’s.',
    stack: ['Python', 'PyTorch', 'Opacus', 'Node.js', 'Next.js', 'PostgreSQL'],
    links: { github: 'https://github.com/SohaKhare/federated-clinical-platform', classic: 'https://hardik-build-log.vercel.app/work/federated-clinical/' },
    shots: [
      { src: '/projects/federated-clinical/1.svg', alt: 'Placeholder diagram: hospital nodes around a global model', caption: 'Placeholder: a screenshot of the platform will go here.', placeholder: true },
    ],
    details: [
      {
        heading: 'The story',
        body: [
          'Hospitals have the data to train useful clinical models but can’t pool patient records. In this platform each hospital runs a local node and keeps its data on-premise; a global node coordinates training rounds and only ever sees model parameters and aggregate metrics, never a patient row.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'Each hospital trains locally with Opacus wrapping the PyTorch optimiser, so every sample’s gradient is clipped and noised before it can influence the shared model. The server averages the updates into the next global model and tracks the privacy budget each round.',
          'The COVID cohort is split per hospital, simulating 41 hospital nodes, so the federation sees the uneven, small local datasets real hospitals would have.',
          'The first DP-FedAvg runs looked fine on accuracy and were useless clinically: the model predicted no deaths at all. The audit traced it to Opacus clipping each sample’s gradient, which silently cancelled the class weighting meant to counter how rare deaths are in the data. Fixing that meant re-thinking the weighting and calibrating the decision threshold, not just training longer.',
        ],
      },
      {
        heading: 'Outcome',
        body: [
          'A working FedAvg and DP-FedAvg pipeline with per-hospital partitioning and tests for the COVID pipeline.',
          'A documented audit of why a 90.6%-accurate model was missing every death, and what it takes to fix it under differential privacy.',
        ],
      },
      {
        heading: 'What I learned',
        body: ['Accuracy is a dangerous number on imbalanced medical data. Privacy tooling changes the maths underneath your loss function, so you have to measure the outcome you actually care about.'],
      },
    ],
  },
  {
    id: 'umang',
    plot: 'umang',
    stall: 'Job board',
    title: 'UMANG: Beyond the Waiting Line',
    short: 'UMANG',
    context: 'Hackathon prototype · 2026',
    team: 'Solo',
    year: 2026,
    oneLiner: 'A multilingual, audio-assisted job platform that brings work to skilled workers in Mumbai.',
    role: 'Product, design and build: the editorial homepage, the worker and employer apps, the hiring lifecycle, the PWA and the voice guidance.',
    stack: ['Next.js', 'TypeScript', 'PWA', 'GSAP', 'Lenis'],
    links: { live: 'https://umang-roan.vercel.app', github: 'https://github.com/HNTRHACK/Artemis26', classic: 'https://hardik-build-log.vercel.app/work/umang/' },
    shots: [
      { src: '/projects/umang/1.webp', alt: 'UMANG homepage reading “Beyond the waiting line” with Find work and Hire workers buttons', caption: 'The homepage, in English, Hindi or Marathi.' },
      { src: '/projects/umang/2.webp', alt: 'Worker app onboarding: choose your language from English, Hindi and Marathi', caption: 'Worker onboarding starts with language, with read-aloud guidance.' },
      { src: '/projects/umang/3.webp', alt: 'Employer app form: tell workers who is hiring', caption: 'The employer side: post work with clear terms.' },
    ],
    note: 'UMANG is an independent hackathon prototype. It is not affiliated with the Government of India’s UMANG app or any government agency. Data is stored only in your browser; there is no login or verification.',
    details: [
      {
        heading: 'The story',
        body: [
          'Skilled workers in Mumbai often find work by waiting at a naka, a street corner where contractors pick people up. UMANG flips that: work should find you. It’s a multilingual (English, हिन्दी, मराठी), audio-assisted job platform that connects masons, electricians and plumbers with nearby employers.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'Every hire moves through an explicit lifecycle, from available through offered, accepted and confirmed to completed, with clear exits for declines and cancellations. Accepting is idempotent: one confirmed hire produces exactly one ticket, and the ticket keeps the accepted terms even if the listing changes later.',
          'Contact happens over channels people already use: WhatsApp, SMS and calls, with Indian numbers normalised.',
          'Voice guidance plays one clip at a time and never autoplays. Missing recordings fall back to a clearly labelled device voice. A hand-written service worker caches the app shell, with an offline fallback page.',
        ],
      },
      {
        heading: 'Outcome',
        body: ['A live, installable prototype covering the whole hiring flow from both sides.'],
      },
      {
        heading: 'What I learned',
        body: ['Accessibility for this audience isn’t a checklist. It’s language, voice and channels people already trust, and it shaped the product more than any visual decision.'],
      },
    ],
  },
  {
    id: 'orion',
    plot: 'orion',
    stall: 'Traffic signal',
    title: 'ORION',
    short: 'ORION',
    context: 'BigD Datathon · 2026',
    team: 'Team',
    year: 2026,
    oneLiner: 'AI traffic forecasting for Mumbai, with a cinematic map interface.',
    role: 'Frontend lead on a team entry: the Three.js landing, the Mapbox map view, the client for the prediction service, the insights and timeline panels and search history. The ML service is the team’s.',
    stack: ['React', 'TypeScript', 'Three.js', 'Framer Motion', 'Mapbox', 'Python ML service'],
    links: { github: 'https://github.com/parthpalav/TrafficAnalyser_-Datathon_BigD', classic: 'https://hardik-build-log.vercel.app/work/orion/' },
    shots: [
      { src: '/projects/orion/1.svg', alt: 'Placeholder diagram: a forecast route across a city grid', caption: 'Placeholder: a screenshot of the map view will go here.', placeholder: true },
    ],
    details: [
      {
        heading: 'The story',
        body: ['Mumbai’s traffic is predictable in hindsight. ORION forecasts it ahead of time and puts the prediction on a map people actually want to look at.'],
      },
      {
        heading: 'How it works',
        body: [
          'The landing sets the tone with a Three.js scene, then hands off to a Mapbox map where forecasts from the Python ML service are drawn over the city.',
          'Insights and timeline panels sit alongside the map so a prediction is always read in context, and search history makes it easy to compare routes.',
        ],
      },
      {
        heading: 'What I learned',
        body: ['A forecast is only as useful as the interface that explains it. Most of my work was making a prediction legible at a glance.'],
      },
    ],
  },
  {
    id: 'cobra-kai',
    plot: 'cobrakai',
    stall: 'Stock kiosk',
    title: 'COBRA KAI: Quantitative Trading Intelligence',
    short: 'COBRA KAI',
    context: 'Quant competition · 2026',
    team: 'Solo',
    year: 2026,
    oneLiner: 'A quant-competition dashboard where every metric traces back to real data.',
    role: 'Data pipeline, validation and dashboard: the pipeline from the quant project’s files, the build-time integrity checks and the fully static Next.js dashboard.',
    stack: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind v4', 'Recharts', 'Lightweight Charts'],
    links: { github: 'https://github.com/HNTRHACK/cobra-kai-dashboard', classic: 'https://hardik-build-log.vercel.app/work/cobra-kai/' },
    shots: [
      { src: '/projects/cobra-kai/1.svg', alt: 'Placeholder diagram: a price line with an out-of-sample window', caption: 'Placeholder: a screenshot of the dashboard will go here.', placeholder: true },
    ],
    details: [
      {
        heading: 'The story',
        body: [
          'This dashboard tells the story of the GLACIER_GAS competition: market analysis, leakage-safe validation, a flash-crash regime, Round 3 signals, hypothetical backtests and public leaderboard results. The rule was that nothing on screen could be typed in by hand.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'A Python script exports sanitised data; the dashboard reads and schema-validates it at build time. Counts, exposure and turnover are recomputed from the submission CSVs on every build.',
          'Backtests run on historical, out-of-sample days only and are labelled hypothetical with assumed costs. The TypeScript backtest engine is checked against the Python one before the build passes.',
          'Withheld data stays withheld: hidden-window values must be null, or the build fails.',
        ],
      },
      {
        heading: 'Outcome',
        body: ['A fully static dashboard where every metric is either recomputed from data or labelled by source.'],
      },
      {
        heading: 'What I learned',
        body: ['The most honest thing a dashboard can say is “not available”. Building the checks into the build made that the default, not a choice.'],
      },
    ],
  },
];
