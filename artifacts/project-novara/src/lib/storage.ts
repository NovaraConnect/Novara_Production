import { Contact } from "@/types/contact";
import { addDays, subDays } from "date-fns";

const STORAGE_KEY = "novara_contacts";
const PROFILE_KEY = "novara_profile";

export interface UserProfile {
  careerStatement: string;
}

export function getProfile(): UserProfile {
  try {
    const data = localStorage.getItem(PROFILE_KEY);
    if (!data) return { careerStatement: "" };
    return JSON.parse(data);
  } catch {
    return { careerStatement: "" };
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getContacts(): Contact[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const raw = JSON.parse(data) as Record<string, unknown>[];
    return raw.map((c) => ({
      initialFollowUpDays: 5,
      followUpCadenceDays: 30,
      cadenceOverride: false,
      basePriority: (c as any).importance ?? "Medium",
      currentPriority: (c as any).importance ?? "Medium",
      priorityOverride: false,
      interests: [],
      ...c,
    })) as unknown as Contact[];
  } catch {
    return [];
  }
}

export function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function seedDataIfNeeded(): void {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return;

  const today = new Date();

  const seed: Contact[] = [
    {
      id: crypto.randomUUID(),
      firstName: "Sarah",
      lastName: "Jones",
      company: "Tesla",
      role: "Recruiter",
      metAt: "MBA Alumni Event",
      importance: "High",
      basePriority: "High",
      currentPriority: "High",
      priorityOverride: false,
      interests: [],
      connectionStatus: "connected",
      initialFollowUpDays: 2,
      followUpCadenceDays: 30,
      cadenceOverride: false,
      firstContactDate: subDays(today, 120).toISOString().split("T")[0],
      lastInteractionDate: subDays(today, 95).toISOString(),
      nextFollowUpDate: subDays(today, 65).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      firstName: "Marc",
      lastName: "Dubois",
      company: "L'Oréal",
      role: "Product Manager",
      metAt: "Former Internship",
      importance: "Medium",
      basePriority: "Medium",
      currentPriority: "Medium",
      priorityOverride: false,
      interests: [],
      connectionStatus: "connected",
      initialFollowUpDays: 3,
      followUpCadenceDays: 60,
      cadenceOverride: false,
      firstContactDate: subDays(today, 60).toISOString().split("T")[0],
      lastInteractionDate: subDays(today, 45).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 45), 60).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      firstName: "Emma",
      lastName: "Chen",
      company: "McKinsey",
      role: "Consultant",
      metAt: "Networking Event",
      importance: "High",
      basePriority: "High",
      currentPriority: "High",
      priorityOverride: false,
      interests: [],
      connectionStatus: "connected",
      initialFollowUpDays: 3,
      followUpCadenceDays: 30,
      cadenceOverride: false,
      firstContactDate: subDays(today, 30).toISOString().split("T")[0],
      lastInteractionDate: subDays(today, 10).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 10), 30).toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  saveContacts(seed);
}

export function addContact(
  contact: Omit<Contact, "id" | "createdAt" | "lastInteractionDate" | "nextFollowUpDate">
): Contact {
  const contacts = getContacts();
  const today = new Date();
  const newContact: Contact = {
    ...contact,
    id: crypto.randomUUID(),
    createdAt: today.toISOString(),
    lastInteractionDate: today.toISOString(),
    nextFollowUpDate: addDays(today, contact.initialFollowUpDays).toISOString(),
  };
  contacts.push(newContact);
  saveContacts(contacts);
  return newContact;
}

export function updateContact(id: string, updates: Partial<Contact>): Contact | null {
  const contacts = getContacts();
  const index = contacts.findIndex((c) => c.id === id);
  if (index === -1) return null;
  contacts[index] = { ...contacts[index], ...updates };
  saveContacts(contacts);
  return contacts[index];
}

export function deleteContact(id: string): void {
  const contacts = getContacts();
  saveContacts(contacts.filter((c) => c.id !== id));
}

export function getContact(id: string): Contact | undefined {
  return getContacts().find((c) => c.id === id);
}

export function markContactedToday(id: string): Contact | null {
  const contact = getContact(id);
  if (!contact) return null;
  const today = new Date();
  return updateContact(id, {
    lastInteractionDate: today.toISOString(),
    nextFollowUpDate: addDays(today, contact.followUpCadenceDays).toISOString(),
  });
}
