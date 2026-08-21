export function generateIcs(
  contactName: string,
  followUpDate: Date,
  notes?: string
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const start = new Date(followUpDate);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(9, 30, 0, 0);

  const uid = `novara-${Date.now()}@novara.app`;
  const now = new Date();

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Novara//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatDt(now)}`,
    `DTSTART:${formatDt(start)}`,
    `DTEND:${formatDt(end)}`,
    `SUMMARY:Follow up with ${contactName}`,
    `DESCRIPTION:${notes ?? "Scheduled via Novara"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: follow up with ${contactName}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(contactName: string, followUpDate: Date, notes?: string): void {
  const ics = generateIcs(contactName, followUpDate, notes);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `follow-up-${contactName.replace(/\s+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(contactName: string, followUpDate: Date, notes?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const start = new Date(followUpDate);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(9, 30, 0, 0);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Follow up with ${contactName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: notes ?? "Scheduled via Novara",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
