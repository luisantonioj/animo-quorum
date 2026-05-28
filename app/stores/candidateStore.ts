/**
 * candidateStore.ts — Zustand store for candidate management
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for both AdminCandidatesScreen and VoteScreen.
 *
 * VISIBILITY RULES:
 *   - Executive Council candidates are visible to ALL departments on the ballot.
 *   - Department-specific candidates are visible ONLY to their own department.
 *   - Positions marked as disabled are excluded from the ballot entirely.
 *
 * USAGE:
 *   const { candidates, addCandidate, getCandidatesForBallot } = useCandidateStore();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEPARTMENTS = [
  'Executive Council',
  'CBEAM',
  'CITE',
  'CON',
  'CEAS',
  'CIHTM',
] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type VoterDepartment = Exclude<Department, 'Executive Council'>;

export const PROGRAMS: Record<VoterDepartment, string[]> = {
  CBEAM: [
    'BS Accountancy',
    'BS Accounting Information System',
    'BS Business Administration (Financial Management)',
    'BS Business Administration (Marketing Management)',
    'BS Entrepreneurship',
    'BS Legal Management',
    'BS Management Technology',
  ],
  CEAS: [
    'AB Communication',
    'Bachelor of Multimedia Arts',
    'BS Biology',
    'Bachelor of Elementary Education',
    'BS Mathematics',
    'BS Psychology',
    'BS Secondary Education (English)',
    'BS Secondary Education (Filipino)',
    'BS Secondary Education (Mathematics)',
    'BS Secondary Education (Social Studies)',
  ],
  CIHTM: [
    'BS Hotel and Restaurant Management',
    'BS Tourism Management',
  ],
  CITE: [
    'BS Architecture',
    'BS Computer Engineering',
    'BS Computer Science',
    'BS Electronics Engineering',
    'BS Electrical Engineering',
    'BS Entertainment and Multimedia Computing (Digital Animation)',
    'BS Entertainment and Multimedia Computing (Game Development)',
    'BS Industrial Engineering',
    'BS Information Technology',
  ],
  CON: [
    'BS Nursing',
  ],
};

export const EXECUTIVE_POSITIONS = [
  'Executive President',
  'Executive Vice President',
  'Executive Secretary',
  'Executive Treasurer',
  'Executive Public Relations Officer',
] as const;

export const DEPARTMENT_POSITIONS = [
  'Governor',
  'Vice Governor',
  'Secretary',
  'Treasurer',
  '1st Year Representative',
  '2nd Year Representative',
  '3rd Year Representative',
  '4th Year Representative',
] as const;

export const PROGRAM_COORDINATOR_POSITION = 'Program Coordinator' as const;

export type ExecutivePosition = (typeof EXECUTIVE_POSITIONS)[number];
export type DepartmentPosition = (typeof DEPARTMENT_POSITIONS)[number];
export type ProgramCoordinatorPosition = typeof PROGRAM_COORDINATOR_POSITION;
export type Position = ExecutivePosition | DepartmentPosition | ProgramCoordinatorPosition;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
  partylist: string;
  position_id: string;       // matches a key in POSITIONS_MAP
  position_name: Position;
  department: Department;    // 'Executive Council' for exec candidates
  program?: string | null;   // non-null only for Program Coordinator candidates
  photo_url: string | null;
  email: string | null;
  credentials: string | null;
  platform: string | null;
}

/** A position entry used internally for ballot rendering */
export interface BallotPosition {
  position_id: string;
  position_name: Position;
  department: Department;
  program?: string | null;
  candidates: Candidate[];
}

// ─── Position ID map ──────────────────────────────────────────────────────────
// Stable string IDs so they survive hot reloads and match Supabase UUIDs later.

export const POSITION_IDS: Record<string, string> = {
  // Executive
  'Executive President': 'pos-exec-president',
  'Executive Vice President': 'pos-exec-vp',
  'Executive Secretary': 'pos-exec-secretary',
  'Executive Treasurer': 'pos-exec-treasurer',
  'Executive Public Relations Officer': 'pos-exec-pro',
  // Department — Governor
  'CBEAM-Governor': 'pos-cbeam-governor',
  'CITE-Governor': 'pos-cite-governor',
  'CON-Governor': 'pos-con-governor',
  'CEAS-Governor': 'pos-ceas-governor',
  'CIHTM-Governor': 'pos-cihtm-governor',
  // Department — Vice Governor
  'CBEAM-Vice Governor': 'pos-cbeam-vgov',
  'CITE-Vice Governor': 'pos-cite-vgov',
  'CON-Vice Governor': 'pos-con-vgov',
  'CEAS-Vice Governor': 'pos-ceas-vgov',
  'CIHTM-Vice Governor': 'pos-cihtm-vgov',
  // Department — Secretary
  'CBEAM-Secretary': 'pos-cbeam-sec',
  'CITE-Secretary': 'pos-cite-sec',
  'CON-Secretary': 'pos-con-sec',
  'CEAS-Secretary': 'pos-ceas-sec',
  'CIHTM-Secretary': 'pos-cihtm-sec',
  // Department — Treasurer
  'CBEAM-Treasurer': 'pos-cbeam-tres',
  'CITE-Treasurer': 'pos-cite-tres',
  'CON-Treasurer': 'pos-con-tres',
  'CEAS-Treasurer': 'pos-ceas-tres',
  'CIHTM-Treasurer': 'pos-cihtm-tres',
  // Representatives
  'CBEAM-1st Year Representative': 'pos-cbeam-rep1',
  'CBEAM-2nd Year Representative': 'pos-cbeam-rep2',
  'CBEAM-3rd Year Representative': 'pos-cbeam-rep3',
  'CBEAM-4th Year Representative': 'pos-cbeam-rep4',
  'CITE-1st Year Representative': 'pos-cite-rep1',
  'CITE-2nd Year Representative': 'pos-cite-rep2',
  'CITE-3rd Year Representative': 'pos-cite-rep3',
  'CITE-4th Year Representative': 'pos-cite-rep4',
  'CON-1st Year Representative': 'pos-con-rep1',
  'CON-2nd Year Representative': 'pos-con-rep2',
  'CON-3rd Year Representative': 'pos-con-rep3',
  'CON-4th Year Representative': 'pos-con-rep4',
  'CEAS-1st Year Representative': 'pos-ceas-rep1',
  'CEAS-2nd Year Representative': 'pos-ceas-rep2',
  'CEAS-3rd Year Representative': 'pos-ceas-rep3',
  'CEAS-4th Year Representative': 'pos-ceas-rep4',
  'CIHTM-1st Year Representative': 'pos-cihtm-rep1',
  'CIHTM-2nd Year Representative': 'pos-cihtm-rep2',
  'CIHTM-3rd Year Representative': 'pos-cihtm-rep3',
  'CIHTM-4th Year Representative': 'pos-cihtm-rep4',
};

/** Resolve position_id for a given department + position combo */
function posId(department: Department, position: Position): string {
  const execPositions: string[] = [...EXECUTIVE_POSITIONS];
  if (execPositions.includes(position)) {
    return POSITION_IDS[position] ?? `pos-unknown-${position}`;
  }
  return POSITION_IDS[`${department}-${position}`] ?? `pos-unknown-${department}-${position}`;
}

// ─── Dummy seed data ──────────────────────────────────────────────────────────

const SEED_CANDIDATES: Candidate[] = [
  // ── Executive Council ──────────────────────────────────────────────────────
  {
    id: 'cand-exec-001',
    name: 'Maria Isabelle Santos',
    partylist: 'Animo Party',
    position_id: posId('Executive Council', 'Executive President'),
    position_name: 'Executive President',
    department: 'Executive Council',
    photo_url: null,
    email: 'mi.santos@dlsl.edu.ph',
    credentials:
      'Former SSC Vice President (SY 2024–2025); Dean\'s Lister for 6 consecutive semesters; ' +
      'National Youth Leadership Summit delegate; Founder of the DLSL Scholars\' Circle.',
    platform:
      'Champion inclusive education by expanding scholarship awareness programs, ' +
      'establish a 24/7 student wellness hub, and strengthen industry linkages to ' +
      'guarantee internship placements for every graduating senior.',
  },
  {
    id: 'cand-exec-002',
    name: 'Rafael Dominic Cruz',
    partylist: 'Gabay Lasalyano',
    position_id: posId('Executive Council', 'Executive President'),
    position_name: 'Executive President',
    department: 'Executive Council',
    photo_url: null,
    email: 'rd.cruz@dlsl.edu.ph',
    credentials:
      'SSC Secretary (SY 2024–2025); PAASCU accreditation student panel member; ' +
      'National winner, JCI Outstanding Young Student Leader Award.',
    platform:
      'Digitalize all SSC services through a unified student portal, create a transparent ' +
      'budget dashboard, and launch the Lipa Campus Climate Action Coalition.',
  },
  {
    id: 'cand-exec-003',
    name: 'Joanna Kristelle Reyes',
    partylist: 'Animo Party',
    position_id: posId('Executive Council', 'Executive Vice President'),
    position_name: 'Executive Vice President',
    department: 'Executive Council',
    photo_url: null,
    email: 'jk.reyes@dlsl.edu.ph',
    credentials:
      'SSC Finance Committee Head; Top 5 in CPA Board Exam mock simulations; ' +
      'Best Thesis Award, Accountancy Department SY 2023–2024.',
    platform:
      'Institute an open-book financial audit policy for all SSC funds, create a peer-mentoring ' +
      'network across all colleges, and lead a sustainability committee to reduce campus waste by 30%.',
  },
  {
    id: 'cand-exec-004',
    name: 'Andrei Miguel Lim',
    partylist: 'Gabay Lasalyano',
    position_id: posId('Executive Council', 'Executive Vice President'),
    position_name: 'Executive Vice President',
    department: 'Executive Council',
    photo_url: null,
    email: 'am.lim@dlsl.edu.ph',
    credentials:
      'College Student Council President (CITE, SY 2024–2025); DICT National Hackathon finalist; ' +
      'Google Developer Student Club lead.',
    platform:
      'Bridge the digital divide between councils with an integrated communication platform, ' +
      'expand the free coding bootcamp initiative, and establish a tech-for-good incubator.',
  },
  {
    id: 'cand-exec-005',
    name: 'Sophia Anne Dela Cruz',
    partylist: 'Animo Party',
    position_id: posId('Executive Council', 'Executive Secretary'),
    position_name: 'Executive Secretary',
    department: 'Executive Council',
    photo_url: null,
    email: 'sa.delacruz@dlsl.edu.ph',
    credentials:
      'SSC Recording Secretary for two terms; Certified Parliamentary Procedure Officer; ' +
      'Outstanding Student Leader, DLSL SY 2023–2024.',
    platform:
      'Overhaul the SSC records system with a fully searchable digital archive, ' +
      'publish monthly activity reports visible to all students, and create a ' +
      'real-time meeting minutes portal.',
  },
  {
    id: 'cand-exec-006',
    name: 'Lorenzo Paulo Mendoza',
    partylist: 'Gabay Lasalyano',
    position_id: posId('Executive Council', 'Executive Secretary'),
    position_name: 'Executive Secretary',
    department: 'Executive Council',
    photo_url: null,
    email: 'lp.mendoza@dlsl.edu.ph',
    credentials:
      'CBEAM Student Council Secretary; Regional winner, Business Writing competition; ' +
      'Volunteer editor, DLSL Lasallian newsletter.',
    platform:
      'Standardize inter-council communication protocols, launch a student feedback loop ' +
      'with guaranteed 48-hour response SLA, and build a centralized events calendar.',
  },
  {
    id: 'cand-exec-007',
    name: 'Camille Beatrice Tan',
    partylist: 'Animo Party',
    position_id: posId('Executive Council', 'Executive Treasurer'),
    position_name: 'Executive Treasurer',
    department: 'Executive Council',
    photo_url: null,
    email: 'cb.tan@dlsl.edu.ph',
    credentials:
      'SSC Assistant Treasurer SY 2024–2025; Certified QuickBooks Specialist; ' +
      'Gold Medalist, Regional Accounting Olympics.',
    platform:
      'Introduce zero-based budgeting for all SSC projects, publish quarterly financial ' +
      'summaries, and establish an emergency student welfare fund with clear disbursement criteria.',
  },
  {
    id: 'cand-exec-008',
    name: 'Patrick James Bautista',
    partylist: 'Gabay Lasalyano',
    position_id: posId('Executive Council', 'Executive Treasurer'),
    position_name: 'Executive Treasurer',
    department: 'Executive Council',
    photo_url: null,
    email: 'pj.bautista@dlsl.edu.ph',
    credentials:
      'CIHTM Finance Officer; Top passer, Accounting certification exam; ' +
      'Volunteer accountant, three Lasallian community outreach programs.',
    platform:
      'Create a student grant matching program with alumni donors, digitize all expense vouchers, ' +
      'and host financial literacy workshops every semester.',
  },
  {
    id: 'cand-exec-009',
    name: 'Tricia Mae Villanueva',
    partylist: 'Animo Party',
    position_id: posId('Executive Council', 'Executive Public Relations Officer'),
    position_name: 'Executive Public Relations Officer',
    department: 'Executive Council',
    photo_url: null,
    email: 'tm.villanueva@dlsl.edu.ph',
    credentials:
      'SSC Social Media Manager SY 2023–2025; Best Campaign, PRSP National Student Congress; ' +
      'Adobe Certified Professional in Visual Design.',
    platform:
      'Rebrand the SSC\'s digital presence with a unified content strategy, launch a ' +
      'weekly student spotlight series, and create a crisis communication playbook for campus emergencies.',
  },
  {
    id: 'cand-exec-010',
    name: 'Kevin Ross Aquino',
    partylist: 'Gabay Lasalyano',
    position_id: posId('Executive Council', 'Executive Public Relations Officer'),
    position_name: 'Executive Public Relations Officer',
    department: 'Executive Council',
    photo_url: null,
    email: 'kr.aquino@dlsl.edu.ph',
    credentials:
      'Campus journalist, three national awards; Host, DLSL Online Town Hall SY 2024–2025; ' +
      'Certified Google Analytics specialist.',
    platform:
      'Launch a multilingual student news platform, create a transparent grievance tracker, ' +
      'and grow SSC social media reach by 200% through targeted community engagement.',
  },

  // ── CBEAM ──────────────────────────────────────────────────────────────────
  {
    id: 'cand-cbeam-001',
    name: 'Nicole Anne Serrano',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', 'Governor'),
    position_name: 'Governor',
    department: 'CBEAM',
    photo_url: null,
    email: 'na.serrano@dlsl.edu.ph',
    credentials:
      'CBEAM Vice Governor SY 2024–2025; National Business Plan Competition champion; ' +
      'Dean\'s Lister, Accountancy, all semesters.',
    platform:
      'Establish a CBEAM mentorship program pairing juniors with alumni professionals, ' +
      'create a department case competition, and advocate for an updated business curriculum.',
  },
  {
    id: 'cand-cbeam-002',
    name: 'Enrico Jose Pascual',
    partylist: 'CBEAM Forward',
    position_id: posId('CBEAM', 'Governor'),
    position_name: 'Governor',
    department: 'CBEAM',
    photo_url: null,
    email: 'ej.pascual@dlsl.edu.ph',
    credentials:
      'CFA Level I candidate; CBEAM Finance Club President; Regional Accountancy Quiz champion.',
    platform:
      'Develop an internship exchange program with Makati firms, push for additional ' +
      'review classes before board exams, and build a CBEAM coworking lounge.',
  },
  {
    id: 'cand-cbeam-003',
    name: 'Dianne Rose Garcia',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CBEAM',
    photo_url: null,
    email: 'dr.garcia@dlsl.edu.ph',
    credentials:
      'CBEAM Secretary SY 2024–2025; Top 10, National Marketing Challenge; ' +
      'Certified Digital Marketing Professional.',
    platform:
      'Streamline departmental communication, organize an annual CBEAM leadership summit, ' +
      'and launch a student-run business incubator inside the department.',
  },
  {
    id: 'cand-cbeam-004',
    name: 'Alvin Paul Navarro',
    partylist: 'CBEAM Forward',
    position_id: posId('CBEAM', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CBEAM',
    photo_url: null,
    email: 'ap.navarro@dlsl.edu.ph',
    credentials:
      'CBEAM Events Head; Finalist, JCI Young Entrepreneur of the Year; ' +
      'Volunteer financial literacy coach for Lipa City public schools.',
    platform:
      'Create inter-college business tournaments, expand free accounting tutorial sessions, ' +
      'and build a CBEAM alumni network database.',
  },
  {
    id: 'cand-cbeam-005',
    name: 'Rachelle Ann Torres',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', 'Secretary'),
    position_name: 'Secretary',
    department: 'CBEAM',
    photo_url: null,
    email: 'ra.torres@dlsl.edu.ph',
    credentials: 'CBEAM Documentation Head; Best Thesis, Management SY 2023–2024.',
    platform:
      'Digitize all CBEAM council records, create a department bulletin board app, ' +
      'and publish an annual state-of-the-department report.',
  },
  {
    id: 'cand-cbeam-006',
    name: 'Mark Anthony Dela Torre',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', 'Treasurer'),
    position_name: 'Treasurer',
    department: 'CBEAM',
    photo_url: null,
    email: 'ma.delatorre@dlsl.edu.ph',
    credentials: 'CPA reviewer top passer; CBEAM Finance Club Treasurer.',
    platform:
      'Introduce transparent project costing for all CBEAM events, create an emergency ' +
      'fund for students in financial difficulty, and digitize all financial reports.',
  },
  {
    id: 'cand-cbeam-007',
    name: 'Jessa Marie Flores',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', '1st Year Representative'),
    position_name: '1st Year Representative',
    department: 'CBEAM',
    photo_url: null,
    email: 'jm.flores@dlsl.edu.ph',
    credentials: 'High school valedictorian; DLSL Presidential Scholar.',
    platform: 'Ease the transition from high school to college business studies with a CBEAM buddy system.',
  },
  {
    id: 'cand-cbeam-008',
    name: 'Carlo Miguel Reyes',
    partylist: 'CBEAM Forward',
    position_id: posId('CBEAM', '2nd Year Representative'),
    position_name: '2nd Year Representative',
    department: 'CBEAM',
    photo_url: null,
    email: 'cm.reyes@dlsl.edu.ph',
    credentials: 'Dean\'s Lister; CBEAM Marketing Club Vice President.',
    platform: 'Advocate for more practicum hours and real-world case study integration in the curriculum.',
  },
  {
    id: 'cand-cbeam-009',
    name: 'Patricia Joy Ocampo',
    partylist: 'CBEAM United',
    position_id: posId('CBEAM', '3rd Year Representative'),
    position_name: '3rd Year Representative',
    department: 'CBEAM',
    photo_url: null,
    email: 'pj.ocampo@dlsl.edu.ph',
    credentials: 'National mock board exam top scorer; Accounting Society President.',
    platform: 'Push for board exam prep seminars and a dedicated review library.',
  },
  {
    id: 'cand-cbeam-010',
    name: 'Bernard Luis Castro',
    partylist: 'CBEAM Forward',
    position_id: posId('CBEAM', '4th Year Representative'),
    position_name: '4th Year Representative',
    department: 'CBEAM',
    photo_url: null,
    email: 'bl.castro@dlsl.edu.ph',
    credentials: 'Thesis Excellence Award; Business Intelligence thesis finalist.',
    platform: 'Strengthen career placement pipelines and organize a senior capstone showcase.',
  },

  // ── CITE ───────────────────────────────────────────────────────────────────
  {
    id: 'cand-cite-001',
    name: 'John Marc Villanueva',
    partylist: 'CITE Innovate',
    position_id: posId('CITE', 'Governor'),
    position_name: 'Governor',
    department: 'CITE',
    photo_url: null,
    email: 'jm.villanueva@dlsl.edu.ph',
    credentials:
      'CITE Vice Governor SY 2024–2025; AWS Certified Developer; ' +
      'DICT National Hackathon champion.',
    platform:
      'Build a CITE open-source projects hub, create a student-faculty tech review board, ' +
      'and lobby for industry-grade development labs.',
  },
  {
    id: 'cand-cite-002',
    name: 'Kyla Denise Manalo',
    partylist: 'CITE Surge',
    position_id: posId('CITE', 'Governor'),
    position_name: 'Governor',
    department: 'CITE',
    photo_url: null,
    email: 'kd.manalo@dlsl.edu.ph',
    credentials:
      'Google Developer Student Club Lead; Finalist, Microsoft Imagine Cup Philippines; ' +
      'Dean\'s Lister, all terms.',
    platform:
      'Establish a CITE innovation lab accessible 24/7, launch a women-in-tech scholarship, ' +
      'and partner with tech startups for live project exposure.',
  },
  {
    id: 'cand-cite-003',
    name: 'Ryan Joseph Sanchez',
    partylist: 'CITE Innovate',
    position_id: posId('CITE', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CITE',
    photo_url: null,
    email: 'rj.sanchez@dlsl.edu.ph',
    credentials: 'CITE Secretary SY 2024–2025; Meta Certified Front-End Developer.',
    platform: 'Streamline council operations with automation tools and push for a student tech magazine.',
  },
  {
    id: 'cand-cite-004',
    name: 'Angela Faith Domingo',
    partylist: 'CITE Surge',
    position_id: posId('CITE', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CITE',
    photo_url: null,
    email: 'af.domingo@dlsl.edu.ph',
    credentials: 'Cybersecurity Club President; Certified Ethical Hacker (student level).',
    platform: 'Champion cybersecurity awareness campaigns and expand the CITE peer tutoring network.',
  },
  {
    id: 'cand-cite-005',
    name: 'Luis Gabriel Soriano',
    partylist: 'CITE Innovate',
    position_id: posId('CITE', 'Secretary'),
    position_name: 'Secretary',
    department: 'CITE',
    photo_url: null,
    email: 'lg.soriano@dlsl.edu.ph',
    credentials: 'CITE Documentation Officer; Best Capstone, Software Engineering SY 2023–2024.',
    platform: 'Create a CITE knowledge base wiki and publish transparent monthly council reports.',
  },
  {
    id: 'cand-cite-006',
    name: 'Marielle Dawn Buenaventura',
    partylist: 'CITE Surge',
    position_id: posId('CITE', 'Treasurer'),
    position_name: 'Treasurer',
    department: 'CITE',
    photo_url: null,
    email: 'md.buenaventura@dlsl.edu.ph',
    credentials: 'CITE Finance Officer; QuickBooks certified; top scorer, accounting units.',
    platform: 'Introduce an equipment rental subsidy fund and transparent per-project budget breakdowns.',
  },
  {
    id: 'cand-cite-007',
    name: 'Francis Lester Guevara',
    partylist: 'CITE Innovate',
    position_id: posId('CITE', '1st Year Representative'),
    position_name: '1st Year Representative',
    department: 'CITE',
    photo_url: null,
    email: 'fl.guevara@dlsl.edu.ph',
    credentials: 'National Science High School valedictorian; DLSL Engineering Scholar.',
    platform: 'Create a freshman survival guide app and organize CITE lab orientation camps.',
  },
  {
    id: 'cand-cite-008',
    name: 'Hannah Grace Espiritu',
    partylist: 'CITE Surge',
    position_id: posId('CITE', '2nd Year Representative'),
    position_name: '2nd Year Representative',
    department: 'CITE',
    photo_url: null,
    email: 'hg.espiritu@dlsl.edu.ph',
    credentials: 'AWS Cloud Practitioner certified; Dean\'s Lister.',
    platform: 'Advocate for cloud computing electives and expanded laptop lending program.',
  },
  {
    id: 'cand-cite-009',
    name: 'Paul Christian Mendez',
    partylist: 'CITE Innovate',
    position_id: posId('CITE', '3rd Year Representative'),
    position_name: '3rd Year Representative',
    department: 'CITE',
    photo_url: null,
    email: 'pc.mendez@dlsl.edu.ph',
    credentials: 'Android development competition champion; Thesis Excellence Award.',
    platform: 'Lobby for mobile app development as a required track and create a CITE app store.',
  },
  {
    id: 'cand-cite-010',
    name: 'Denise Clarisse Halili',
    partylist: 'CITE Surge',
    position_id: posId('CITE', '4th Year Representative'),
    position_name: '4th Year Representative',
    department: 'CITE',
    photo_url: null,
    email: 'dc.halili@dlsl.edu.ph',
    credentials: 'Best Capstone Project; Google Women Techmakers scholar.',
    platform: 'Facilitate tech career fairs and establish CITE alumni mentorship circles.',
  },

  // ── CON ────────────────────────────────────────────────────────────────────
  {
    id: 'cand-con-001',
    name: 'Kristine Joy Padilla',
    partylist: 'CON Cares',
    position_id: posId('CON', 'Governor'),
    position_name: 'Governor',
    department: 'CON',
    photo_url: null,
    email: 'kj.padilla@dlsl.edu.ph',
    credentials:
      'CON Vice Governor SY 2024–2025; Top 10, Nurse Licensure Examination mock board; ' +
      'National nursing leadership awardee.',
    platform:
      'Advocate for simulation lab upgrades, establish a student nurse wellness fund, ' +
      'and create a licensure exam review program within the department.',
  },
  {
    id: 'cand-con-002',
    name: 'Manuel Pio Ramirez',
    partylist: 'CON Solidarity',
    position_id: posId('CON', 'Governor'),
    position_name: 'Governor',
    department: 'CON',
    photo_url: null,
    email: 'mp.ramirez@dlsl.edu.ph',
    credentials: 'CON Secretary; Best Nurse, Clinical Area SY 2023–2024; PNA student chapter president.',
    platform: 'Negotiate more clinical duty hours in partner hospitals and expand the nursing faculty ratio.',
  },
  {
    id: 'cand-con-003',
    name: 'Abigail Faith Coronel',
    partylist: 'CON Cares',
    position_id: posId('CON', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CON',
    photo_url: null,
    email: 'af.coronel@dlsl.edu.ph',
    credentials: 'CON Documentation Head; Community health outreach coordinator.',
    platform: 'Build a CON mental health first-aid training program and a student nurse support group.',
  },
  {
    id: 'cand-con-004',
    name: 'Bryan Isaac Gutierrez',
    partylist: 'CON Solidarity',
    position_id: posId('CON', 'Secretary'),
    position_name: 'Secretary',
    department: 'CON',
    photo_url: null,
    email: 'bi.gutierrez@dlsl.edu.ph',
    credentials: 'CON Events Officer; Best Case Study presenter, Regional Nursing Congress.',
    platform: 'Digitize all CON council communications and launch a student nursing journal.',
  },
  {
    id: 'cand-con-005',
    name: 'Melissa Anne Tolentino',
    partylist: 'CON Cares',
    position_id: posId('CON', 'Treasurer'),
    position_name: 'Treasurer',
    department: 'CON',
    photo_url: null,
    email: 'ma.tolentino@dlsl.edu.ph',
    credentials: 'CON Finance Officer; Top scorer, pharmacology and health economics units.',
    platform: 'Establish a uniform and equipment subsidy program for nursing students in financial need.',
  },
  {
    id: 'cand-con-006',
    name: 'Jerome Paul Aguilar',
    partylist: 'CON Cares',
    position_id: posId('CON', '1st Year Representative'),
    position_name: '1st Year Representative',
    department: 'CON',
    photo_url: null,
    email: 'jp.aguilar@dlsl.edu.ph',
    credentials: 'Science strand valedictorian; DLSL Nursing Scholar.',
    platform: 'Create a CON freshman orientation module and clinical skills early exposure program.',
  },
  {
    id: 'cand-con-007',
    name: 'Camille Ruth Estrada',
    partylist: 'CON Solidarity',
    position_id: posId('CON', '2nd Year Representative'),
    position_name: '2nd Year Representative',
    department: 'CON',
    photo_url: null,
    email: 'cr.estrada@dlsl.edu.ph',
    credentials: 'Dean\'s Lister; Anatomy and physiology tutoring club head.',
    platform: 'Advocate for additional simulation lab hours and peer-led study groups.',
  },
  {
    id: 'cand-con-008',
    name: 'Ronnie James Bernardo',
    partylist: 'CON Cares',
    position_id: posId('CON', '3rd Year Representative'),
    position_name: '3rd Year Representative',
    department: 'CON',
    photo_url: null,
    email: 'rj.bernardo@dlsl.edu.ph',
    credentials: 'Red Cross volunteer; Best Clinical Performance, Level III.',
    platform: 'Push for better hospital exposure scheduling and create a CON clinical buddy system.',
  },
  {
    id: 'cand-con-009',
    name: 'Lara Nicole Domingo',
    partylist: 'CON Solidarity',
    position_id: posId('CON', '4th Year Representative'),
    position_name: '4th Year Representative',
    department: 'CON',
    photo_url: null,
    email: 'ln.domingo@dlsl.edu.ph',
    credentials: 'Top NLE mock board scorer; Research excellence award, nursing thesis.',
    platform: 'Establish a job placement program and post-boards review sponsorship fund.',
  },

  // ── CEAS ───────────────────────────────────────────────────────────────────
  {
    id: 'cand-ceas-001',
    name: 'Franz Oliver Herrera',
    partylist: 'CEAS Progress',
    position_id: posId('CEAS', 'Governor'),
    position_name: 'Governor',
    department: 'CEAS',
    photo_url: null,
    email: 'fo.herrera@dlsl.edu.ph',
    credentials:
      'CEAS Vice Governor SY 2024–2025; Board passer, Civil Engineering (top 15); ' +
      'Best Structural Design, PICE student chapter.',
    platform:
      'Upgrade CEAS laboratories with industry-standard equipment, establish a professional ' +
      'review program before board exams, and create an engineering thesis repository.',
  },
  {
    id: 'cand-ceas-002',
    name: 'Bianca Marie Ramos',
    partylist: 'CEAS Build',
    position_id: posId('CEAS', 'Governor'),
    position_name: 'Governor',
    department: 'CEAS',
    photo_url: null,
    email: 'bm.ramos@dlsl.edu.ph',
    credentials: 'CEAS Secretary; IECEP Best Paper Award; Dean\'s Lister, Electronics Engineering.',
    platform: 'Expand industry immersion programs, push for a makerspace facility, and improve lab safety standards.',
  },
  {
    id: 'cand-ceas-003',
    name: 'Gerard Anthony Lacson',
    partylist: 'CEAS Progress',
    position_id: posId('CEAS', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CEAS',
    photo_url: null,
    email: 'ga.lacson@dlsl.edu.ph',
    credentials: 'CEAS Events Officer; Regional CAD design competition champion.',
    platform: 'Create a CEAS innovation showcase and negotiate field trip credits with engineering firms.',
  },
  {
    id: 'cand-ceas-004',
    name: 'Sheila Marie Duran',
    partylist: 'CEAS Build',
    position_id: posId('CEAS', 'Secretary'),
    position_name: 'Secretary',
    department: 'CEAS',
    photo_url: null,
    email: 'sm.duran@dlsl.edu.ph',
    credentials: 'CEAS Documentation Head; Best Research Paper, Architecture SY 2023–2024.',
    platform: 'Digitize CEAS council archives and create a transparent meeting minutes portal.',
  },
  {
    id: 'cand-ceas-005',
    name: 'Philip James Castillo',
    partylist: 'CEAS Progress',
    position_id: posId('CEAS', 'Treasurer'),
    position_name: 'Treasurer',
    department: 'CEAS',
    photo_url: null,
    email: 'pj.castillo@dlsl.edu.ph',
    credentials: 'CEAS Finance Officer; Top scorer, engineering economics.',
    platform: 'Create a materials subsidy fund for project-heavy semesters and publish quarterly budget reports.',
  },
  {
    id: 'cand-ceas-006',
    name: 'Jasmine Lou Perez',
    partylist: 'CEAS Progress',
    position_id: posId('CEAS', '1st Year Representative'),
    position_name: '1st Year Representative',
    department: 'CEAS',
    photo_url: null,
    email: 'jl.perez@dlsl.edu.ph',
    credentials: 'STEMvaledictorian; DLSL Engineering Scholar.',
    platform: 'Build a freshman engineering community group and organize lab safety orientation workshops.',
  },
  {
    id: 'cand-ceas-007',
    name: 'Victor Emmanuel Santos',
    partylist: 'CEAS Build',
    position_id: posId('CEAS', '2nd Year Representative'),
    position_name: '2nd Year Representative',
    department: 'CEAS',
    photo_url: null,
    email: 've.santos@dlsl.edu.ph',
    credentials: 'Dean\'s Lister; Mathematics Society VP.',
    platform: 'Advocate for math-intensive tutoring sessions and expanded engineering electives.',
  },
  {
    id: 'cand-ceas-008',
    name: 'Roxanne Therese Villafuerte',
    partylist: 'CEAS Progress',
    position_id: posId('CEAS', '3rd Year Representative'),
    position_name: '3rd Year Representative',
    department: 'CEAS',
    photo_url: null,
    email: 'rt.villafuerte@dlsl.edu.ph',
    credentials: 'Best Design Project, Civil Engineering; PICE student member.',
    platform: 'Push for more OJT placements in Batangas infrastructure projects.',
  },
  {
    id: 'cand-ceas-009',
    name: 'Edgar John Abad',
    partylist: 'CEAS Build',
    position_id: posId('CEAS', '4th Year Representative'),
    position_name: '4th Year Representative',
    department: 'CEAS',
    photo_url: null,
    email: 'ej.abad@dlsl.edu.ph',
    credentials: 'Top 20, Civil Engineering mock board; capstone excellence award.',
    platform: 'Organize board exam review partnerships and alumni engineering mentorship sessions.',
  },

  // ── CIHTM ──────────────────────────────────────────────────────────────────
  {
    id: 'cand-cihtm-001',
    name: 'Mikaela Rose Batungbakal',
    partylist: 'CIHTM Excel',
    position_id: posId('CIHTM', 'Governor'),
    position_name: 'Governor',
    department: 'CIHTM',
    photo_url: null,
    email: 'mr.batungbakal@dlsl.edu.ph',
    credentials:
      'CIHTM Vice Governor SY 2024–2025; Gold Medal, National Culinary Competition; ' +
      'Tourism and Hospitality Youth Leadership delegate.',
    platform:
      'Expand CIHTM industry immersion to five-star hotels in Metro Manila, establish a ' +
      'culinary scholarship fund, and create a student hospitality concierge service program.',
  },
  {
    id: 'cand-cihtm-002',
    name: 'Dario Jose Morales',
    partylist: 'CIHTM Horizon',
    position_id: posId('CIHTM', 'Governor'),
    position_name: 'Governor',
    department: 'CIHTM',
    photo_url: null,
    email: 'dj.morales@dlsl.edu.ph',
    credentials:
      'CIHTM Events Chair; Best Barista, DLSL Skills Olympics 3 years running; ' +
      'TESDA certified hospitality NC II.',
    platform:
      'Negotiate live hotel practicum contracts, launch a sustainable tourism research center, ' +
      'and push for a dedicated event management simulation suite.',
  },
  {
    id: 'cand-cihtm-003',
    name: 'Angela Corinne Sicat',
    partylist: 'CIHTM Excel',
    position_id: posId('CIHTM', 'Vice Governor'),
    position_name: 'Vice Governor',
    department: 'CIHTM',
    photo_url: null,
    email: 'ac.sicat@dlsl.edu.ph',
    credentials: 'CIHTM Secretary; Regional Tourism Quiz Bee champion.',
    platform: 'Launch a CIHTM exchange program with Asian hospitality schools and improve lab facilities.',
  },
  {
    id: 'cand-cihtm-004',
    name: 'Ivan Paul Carandang',
    partylist: 'CIHTM Horizon',
    position_id: posId('CIHTM', 'Secretary'),
    position_name: 'Secretary',
    department: 'CIHTM',
    photo_url: null,
    email: 'ip.carandang@dlsl.edu.ph',
    credentials: 'CIHTM Documentation Officer; Best Event Proposal, regional competition.',
    platform: 'Create a digital CIHTM council portal and a student-run catering events digest.',
  },
  {
    id: 'cand-cihtm-005',
    name: 'Theresa Joy Revilleza',
    partylist: 'CIHTM Excel',
    position_id: posId('CIHTM', 'Treasurer'),
    position_name: 'Treasurer',
    department: 'CIHTM',
    photo_url: null,
    email: 'tj.revilleza@dlsl.edu.ph',
    credentials: 'CIHTM Finance Officer; top scorer, hospitality financial management units.',
    platform: 'Establish a tools and uniform subsidy program and publish CIHTM budget summaries per event.',
  },
  {
    id: 'cand-cihtm-006',
    name: 'Samantha Leigh Fajardo',
    partylist: 'CIHTM Excel',
    position_id: posId('CIHTM', '1st Year Representative'),
    position_name: '1st Year Representative',
    department: 'CIHTM',
    photo_url: null,
    email: 'sl.fajardo@dlsl.edu.ph',
    credentials: 'Culinary Arts valedictorian (SHS); DLSL CIHTM Scholar.',
    platform: 'Create a CIHTM freshman kitchen skills bootcamp and peer buddy program.',
  },
  {
    id: 'cand-cihtm-007',
    name: 'Joseph Clark Delos Reyes',
    partylist: 'CIHTM Horizon',
    position_id: posId('CIHTM', '2nd Year Representative'),
    position_name: '2nd Year Representative',
    department: 'CIHTM',
    photo_url: null,
    email: 'jc.delosreyes@dlsl.edu.ph',
    credentials: 'Dean\'s Lister; Best Barista, Year-2 Skills competition.',
    platform: 'Push for upgraded kitchen equipment and negotiate corporate sponsorships for lab ingredients.',
  },
  {
    id: 'cand-cihtm-008',
    name: 'Maricel Anne Quisumbing',
    partylist: 'CIHTM Excel',
    position_id: posId('CIHTM', '3rd Year Representative'),
    position_name: '3rd Year Representative',
    department: 'CIHTM',
    photo_url: null,
    email: 'ma.quisumbing@dlsl.edu.ph',
    credentials: 'Regional Events Management Best Paper; Hotel Operations OJT Excellence Award.',
    platform: 'Expand practicum partner network and create a student events consultancy group.',
  },
  {
    id: 'cand-cihtm-009',
    name: 'Noel Vincent Arevalo',
    partylist: 'CIHTM Horizon',
    position_id: posId('CIHTM', '4th Year Representative'),
    position_name: '4th Year Representative',
    department: 'CIHTM',
    photo_url: null,
    email: 'nv.arevalo@dlsl.edu.ph',
    credentials: 'Best Thesis, Tourism Management; ASEAN tourism conference presenter.',
    platform: 'Develop a CIHTM alumni employment tracker and organize a job fair with hospitality industry partners.',
  },
];

// ─── Store interface ──────────────────────────────────────────────────────────

interface CandidateStore {
  candidates: Candidate[];
  /** Set of position_ids that are disabled and excluded from the ballot */
  disabledPositions: Set<string>;

  // ── CRUD ─────────────────────────────────────────────────────────────────
  addCandidate: (candidate: Candidate) => void;
  updateCandidate: (id: string, updates: Partial<Omit<Candidate, 'id'>>) => void;
  deleteCandidate: (id: string) => void;

  // ── Position control ──────────────────────────────────────────────────────
  togglePositionDisabled: (positionId: string) => void;

  // ── Selectors ─────────────────────────────────────────────────────────────
  /** All candidates belonging to a specific department */
  getCandidatesForDepartment: (department: Department) => Candidate[];
  /**
   * Returns ballot positions (with their candidates) visible to the given
   * voter's department.
   *   - Executive positions are included for every department.
   *   - Department positions are included only for the matching department.
   *   - Disabled positions are excluded entirely.
   */
  getCandidatesForBallot: (voterDepartment: Exclude<Department, 'Executive Council'>) => BallotPosition[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCandidateStore = create<CandidateStore>((set, get) => ({
  candidates: SEED_CANDIDATES,
  disabledPositions: new Set<string>(),

  // ── CRUD ──────────────────────────────────────────────────────────────────

  addCandidate: (candidate) =>
    set((state) => ({ candidates: [...state.candidates, candidate] })),

  updateCandidate: (id, updates) =>
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  deleteCandidate: (id) =>
    set((state) => ({
      candidates: state.candidates.filter((c) => c.id !== id),
    })),

  // ── Position control ──────────────────────────────────────────────────────

  togglePositionDisabled: (positionId) =>
    set((state) => {
      const next = new Set(state.disabledPositions);
      if (next.has(positionId)) {
        next.delete(positionId);
      } else {
        next.add(positionId);
      }
      return { disabledPositions: next };
    }),

  // ── Selectors ─────────────────────────────────────────────────────────────

  getCandidatesForDepartment: (department) => {
    const { candidates } = get();
    return candidates.filter((c) => c.department === department);
  },

  getCandidatesForBallot: (voterDepartment) => {
    const { candidates, disabledPositions } = get();

    // Determine which candidates are visible to this voter
    const visible = candidates.filter((c) => {
      const isExec = c.department === 'Executive Council';
      const isDeptMatch = c.department === voterDepartment;
      return isExec || isDeptMatch;
    });

    // Group by position_id, preserving display order
    const positionMap = new Map<string, BallotPosition>();

    visible.forEach((c) => {
      if (disabledPositions.has(c.position_id)) return;

      if (!positionMap.has(c.position_id)) {
        positionMap.set(c.position_id, {
          position_id: c.position_id,
          position_name: c.position_name,
          department: c.department,
          program: c.program ?? null,
          candidates: [],
        });
      }
      positionMap.get(c.position_id)!.candidates.push(c);
    });

    // Sort: exec council → dept positions → program coordinator
    const execOrder = [...EXECUTIVE_POSITIONS] as string[];
    const deptOrder = [...DEPARTMENT_POSITIONS] as string[];

    return [...positionMap.values()].sort((a, b) => {
      const aIsCoord = a.position_name === PROGRAM_COORDINATOR_POSITION;
      const bIsCoord = b.position_name === PROGRAM_COORDINATOR_POSITION;
      if (aIsCoord && !bIsCoord) return 1;
      if (!aIsCoord && bIsCoord) return -1;

      const aExecIdx = execOrder.indexOf(a.position_name);
      const bExecIdx = execOrder.indexOf(b.position_name);
      const aDeptIdx = deptOrder.indexOf(a.position_name);
      const bDeptIdx = deptOrder.indexOf(b.position_name);

      if (aExecIdx !== -1 && bExecIdx !== -1) return aExecIdx - bExecIdx;
      if (aExecIdx !== -1) return -1;
      if (bExecIdx !== -1) return 1;
      return aDeptIdx - bDeptIdx;
    });
  },
}));