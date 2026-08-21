import AsyncStorage from "@react-native-async-storage/async-storage";
import { Contact } from "@/types/contact";
import { addDays, subDays, generateId } from "@/lib/utils";

const STORAGE_KEY = "novara_contacts";
const PROFILE_KEY = "novara_profile";

export interface UserProfile {
  careerStatement: string;
  goalTags: string[];
}

export async function getProfile(): Promise<UserProfile> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_KEY);
    if (!data) return { careerStatement: "", goalTags: [] };
    return JSON.parse(data);
  } catch {
    return { careerStatement: "", goalTags: [] };
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function getContacts(): Promise<Contact[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const raw = JSON.parse(data) as Record<string, unknown>[];
    return raw.map((c) => ({
      connectionStatus: "connected",
      goalTags: [],
      initialFollowUpDays: 5,
      followUpCadenceDays: 30,
      ...c,
    })) as unknown as Contact[];
  } catch {
    return [];
  }
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export async function seedDataIfNeeded(): Promise<void> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return;

  const today = new Date();

  const seed: Contact[] = [
    {
      id: generateId(),
      firstName: "Sarah",
      lastName: "Jones",
      company: "Tesla",
      role: "Recruiter",
      metAt: "MBA Alumni Event",
      importance: "High",
      initialFollowUpDays: 2,
      followUpCadenceDays: 30,
      goalTags: [],
      connectionStatus: "connected",
      lastInteractionDate: subDays(today, 95).toISOString(),
      nextFollowUpDate: subDays(today, 65).toISOString(),
      createdAt: today.toISOString(),
    },
    {
      id: generateId(),
      firstName: "Marc",
      lastName: "Dubois",
      company: "L'Oréal",
      role: "Product Manager",
      metAt: "Former Internship",
      importance: "Medium",
      initialFollowUpDays: 5,
      followUpCadenceDays: 60,
      goalTags: [],
      connectionStatus: "connected",
      lastInteractionDate: subDays(today, 45).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 45), 60).toISOString(),
      createdAt: today.toISOString(),
    },
    {
      id: generateId(),
      firstName: "Emma",
      lastName: "Chen",
      company: "McKinsey",
      role: "Consultant",
      metAt: "Networking Event",
      importance: "High",
      initialFollowUpDays: 3,
      followUpCadenceDays: 30,
      goalTags: [],
      connectionStatus: "connected",
      lastInteractionDate: subDays(today, 10).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 10), 30).toISOString(),
      createdAt: today.toISOString(),
    },
    {
      id: generateId(),
      firstName: "James",
      lastName: "Okafor",
      company: "Sequoia Capital",
      role: "Principal",
      metAt: "LinkedIn outreach",
      importance: "High",
      initialFollowUpDays: 1,
      followUpCadenceDays: 14,
      goalTags: [],
      connectionStatus: "pipeline",
      lastInteractionDate: subDays(today, 5).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 5), 14).toISOString(),
      createdAt: today.toISOString(),
    },
    {
      id: generateId(),
      firstName: "Priya",
      lastName: "Nair",
      company: "Stripe",
      role: "Product Lead",
      metAt: "Twitter/X DM",
      importance: "Medium",
      initialFollowUpDays: 1,
      followUpCadenceDays: 30,
      goalTags: [],
      connectionStatus: "pipeline",
      lastInteractionDate: subDays(today, 18).toISOString(),
      nextFollowUpDate: addDays(subDays(today, 18), 30).toISOString(),
      createdAt: today.toISOString(),
    },
  ];

  await saveContacts(seed);
}

export async function addContact(
  contact: Omit<Contact, "id" | "createdAt" | "lastInteractionDate" | "nextFollowUpDate">
): Promise<Contact> {
  const contacts = await getContacts();
  const today = new Date();
  const newContact: Contact = {
    ...contact,
    id: generateId(),
    createdAt: today.toISOString(),
    lastInteractionDate: today.toISOString(),
    nextFollowUpDate: addDays(today, contact.initialFollowUpDays).toISOString(),
  };
  contacts.push(newContact);
  await saveContacts(contacts);
  return newContact;
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
  const contacts = await getContacts();
  const index = contacts.findIndex((c) => c.id === id);
  if (index === -1) return null;
  contacts[index] = { ...contacts[index], ...updates };
  await saveContacts(contacts);
  return contacts[index];
}

export async function deleteContact(id: string): Promise<void> {
  const contacts = await getContacts();
  await saveContacts(contacts.filter((c) => c.id !== id));
}

export async function getContact(id: string): Promise<Contact | undefined> {
  const contacts = await getContacts();
  return contacts.find((c) => c.id === id);
}

export async function markContactedToday(id: string): Promise<Contact | null> {
  const contact = await getContact(id);
  if (!contact) return null;
  const today = new Date();
  return updateContact(id, {
    lastInteractionDate: today.toISOString(),
    nextFollowUpDate: addDays(today, contact.followUpCadenceDays).toISOString(),
  });
}
