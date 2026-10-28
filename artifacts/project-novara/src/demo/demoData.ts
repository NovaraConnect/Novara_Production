import { addDays, startOfDay } from "date-fns";
import { Contact, UserSettings } from "@/types/contact";

// ============================================================================
// Sample data for the public demo at /try.
//
// EVERY DATE IS RELATIVE TO TODAY. The demo used to be frozen at a fixed date;
// once that date passed, every contact drifted to Cold or Dormant and the demo
// showed a Network Health of 0/100. Relative dates keep the same picture on
// any day, which demoData.test.ts checks:
//
//   Sarah   due today        Warm     (the tour's example)
//   Alex    due in 4 days    Warm
//   James   due in 9 days    Warm
//   Marc    3 days overdue   Cooling
//   Priya   12 days overdue  Cooling
//   Emma    40 days overdue  Cold
//   Léa     pipeline, not yet counted in Network Health
//
// The people are fictional. Email addresses use example.com, which is
// reserved for documentation, so nobody real can be emailed from the demo.
// ============================================================================

const TODAY = startOfDay(new Date());

/** An ISO timestamp `n` days from today (negative for the past). */
const day = (n: number) => addDays(TODAY, n).toISOString();

export const DEMO_CONTACTS: Contact[] = [
  {
    id: "demo-sarah",
    firstName: "Sarah",
    lastName: "Jones",
    company: "Tesla",
    role: "Senior Recruiter",
    linkedinUrl: "https://linkedin.com/in/sarah-jones",
    email: "sarah.jones@example.com",
    phone: "+1 415 555 0192",
    metAt: "TechCrunch Disrupt 2025",
    importance: "High",
    basePriority: "High",
    currentPriority: "High",
    priorityOverride: false,
    industry: "Technology",
    interests: [],
    connectionStatus: "connected",
    initialFollowUpDays: 3,
    followUpCadenceDays: 30,
    cadenceOverride: false,
    firstContactDate: day(-320),
    lastInteractionDate: day(-30),
    nextFollowUpDate: day(0),
    notes: "Discussed engineering leadership roles opening in Q3. She mentioned they're expanding the ML team. Follow up about positions — she prefers a quick LinkedIn message first.",
    createdAt: day(-320),
  },
  {
    id: "demo-marc",
    firstName: "Marc",
    lastName: "Dubois",
    company: "L'Oréal",
    role: "Product Manager",
    linkedinUrl: "https://linkedin.com/in/marc-dubois",
    metAt: "SXSW 2025",
    importance: "Medium",
    basePriority: "Medium",
    currentPriority: "Medium",
    priorityOverride: false,
    interests: [],
    connectionStatus: "connected",
    initialFollowUpDays: 3,
    followUpCadenceDays: 60,
    cadenceOverride: false,
    firstContactDate: day(-300),
    lastInteractionDate: day(-63),
    nextFollowUpDate: day(-3),
    notes: "Building a professional network in beauty-tech. Potential collaboration on consumer insights data. Reach out about the new L'Oréal Tech Incubator program.",
    createdAt: day(-300),
  },
  {
    id: "demo-priya",
    firstName: "Priya",
    lastName: "Sharma",
    company: "Sequoia Capital",
    role: "Partner",
    linkedinUrl: "https://linkedin.com/in/priya-sharma",
    metAt: "YC Demo Day Spring 2025",
    importance: "High",
    basePriority: "High",
    currentPriority: "High",
    priorityOverride: false,
    industry: "Venture Capital",
    interests: ["climate tech", "AI governance"],
    connectionStatus: "connected",
    initialFollowUpDays: 3,
    followUpCadenceDays: 60,
    cadenceOverride: false,
    firstContactDate: day(-340),
    lastInteractionDate: day(-72),
    nextFollowUpDate: day(-12),
    notes: "Focuses on climate tech and AI governance investments. She mentioned interest in my work on sustainable infrastructure. Strong YC ecosystem connection.",
    createdAt: day(-340),
  },
  {
    id: "demo-james",
    firstName: "James",
    lastName: "Okafor",
    company: "Google",
    role: "Staff Engineer",
    linkedinUrl: "https://linkedin.com/in/james-okafor",
    metAt: "Google I/O 2026",
    importance: "Medium",
    basePriority: "Medium",
    currentPriority: "Medium",
    priorityOverride: false,
    industry: "Technology",
    function: "Engineering",
    interests: ["AI", "machine learning"],
    connectionStatus: "connected",
    initialFollowUpDays: 3,
    followUpCadenceDays: 30,
    cadenceOverride: false,
    firstContactDate: day(-290),
    lastInteractionDate: day(-21),
    nextFollowUpDate: day(9),
    notes: "",
    createdAt: day(-290),
  },
  {
    id: "demo-alex",
    firstName: "Alex",
    lastName: "Rivera",
    company: "Stripe",
    role: "Head of Growth",
    linkedinUrl: "https://linkedin.com/in/alex-rivera",
    metAt: "Stripe Sessions 2026",
    importance: "Medium",
    basePriority: "Medium",
    currentPriority: "Medium",
    priorityOverride: false,
    industry: "Fintech",
    function: "Growth",
    interests: [],
    connectionStatus: "connected",
    initialFollowUpDays: 3,
    followUpCadenceDays: 30,
    cadenceOverride: false,
    firstContactDate: day(-255),
    lastInteractionDate: day(-26),
    nextFollowUpDate: day(4),
    notes: "",
    createdAt: day(-255),
  },
  {
    id: "demo-emma",
    firstName: "Emma",
    lastName: "Chen",
    company: "McKinsey & Company",
    role: "Senior Consultant",
    linkedinUrl: "https://linkedin.com/in/emma-chen",
    metAt: "HBS Alumni Event 2024",
    importance: "High",
    basePriority: "High",
    currentPriority: "High",
    priorityOverride: false,
    industry: "Consulting",
    function: "Strategy",
    interests: [],
    connectionStatus: "connected",
    initialFollowUpDays: 2,
    followUpCadenceDays: 90,
    cadenceOverride: false,
    firstContactDate: day(-880),
    lastInteractionDate: day(-130),
    nextFollowUpDate: day(-40),
    notes: "Strategy consultant focused on digital transformation in financial services. Could be valuable for consulting referrals. Last talked at the alumni mixer in January.",
    createdAt: day(-880),
  },
  {
    id: "demo-lea",
    firstName: "Léa",
    lastName: "Moreau",
    company: "LVMH",
    role: "Marketing Director",
    linkedinUrl: "https://linkedin.com/in/lea-moreau",
    metAt: "Paris Tech Summit 2024",
    importance: "Low",
    basePriority: "Low",
    currentPriority: "Low",
    priorityOverride: false,
    industry: "Luxury Retail",
    function: "Marketing",
    interests: ["luxury brand innovation", "AI personalisation"],
    connectionStatus: "pipeline",
    initialFollowUpDays: 3,
    followUpCadenceDays: 90,
    cadenceOverride: false,
    firstContactDate: day(-790),
    lastInteractionDate: day(-70),
    nextFollowUpDate: day(20),
    notes: "Leading digital transformation at LVMH. Interested in luxury brand innovation and AI personalisation. Met briefly at the summit keynote.",
    createdAt: day(-790),
  },
];

export const DEMO_SETTINGS: UserSettings = {
  autoDowngradeAfterMonths: 12,
  careerStatement: "Product leader with a focus on growth and developer tools",
  careerGoals: [],
  goalTags: [],
  hasSeenTutorial: true,
};

export interface DemoHeadline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}

/** Sample conversation starters for Sarah (Tesla). In the app these are real,
 *  daily headlines; here they are illustrative, so they are labelled as
 *  samples and not credited to any real publication. */
export const TESLA_NEWS: DemoHeadline[] = [
  {
    title: "Tesla expands its AI and robotics hiring ahead of next year’s product cycle",
    source: "Sample headline",
    publishedAt: day(-2),
    url: "",
  },
  {
    title: "Tesla’s engineering teams open new roles in machine learning",
    source: "Sample headline",
    publishedAt: day(-5),
    url: "",
  },
];
