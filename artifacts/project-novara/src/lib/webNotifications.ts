export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function sendNotification(title: string, body: string, contactId?: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    data: { contactId },
  });
  n.onclick = () => {
    window.focus();
    if (contactId) window.location.hash = `/contacts/${contactId}`;
  };
}

const DIGEST_KEY = "novara_digest_enabled";
const DIGEST_TIME_KEY = "novara_digest_time";

export function isDigestEnabled(): boolean {
  return localStorage.getItem(DIGEST_KEY) === "true";
}

export function setDigestEnabled(enabled: boolean): void {
  localStorage.setItem(DIGEST_KEY, String(enabled));
}

export function getDigestTime(): string {
  return localStorage.getItem(DIGEST_TIME_KEY) ?? "09:00";
}

export function setDigestTime(time: string): void {
  localStorage.setItem(DIGEST_TIME_KEY, time);
}

let digestTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDigestCheck(
  getOverdueCount: () => number,
  timeStr: string = getDigestTime()
): void {
  if (digestTimer) clearTimeout(digestTimer);
  if (!isDigestEnabled()) return;

  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const ms = target.getTime() - now.getTime();
  digestTimer = setTimeout(() => {
    const count = getOverdueCount();
    if (count > 0) {
      sendNotification(
        "Your network check-in 📋",
        `You have ${count} overdue follow-up${count > 1 ? "s" : ""} in Novara`
      );
    }
    scheduleDigestCheck(getOverdueCount, timeStr);
  }, ms);
}
