import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Copy, Linkedin, Loader2, Mail, MessageSquare, PenLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchSuggestedMessage } from "@/lib/api";
import {
  availableMethods, draftHref, openContactMethod, usablePreferred, METHOD_LABEL, type ContactMethod,
} from "@/lib/contactActions";
import { cn } from "@/lib/utils";
import { Contact } from "@/types/contact";

const METHOD_ICON: Record<ContactMethod, typeof Mail> = { text: MessageSquare, email: Mail, linkedin: Linkedin };
// Opens the compose screen prefilled; the user still sends it themselves.
const SEND_LABEL: Record<ContactMethod, string> = { text: "Open in Messages", email: "Open in Mail", linkedin: "Copy for LinkedIn" };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews without the async clipboard API.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

/**
 * A ready-to-send draft for reaching out, shown near "Contact now". The user
 * edits it, then copies it or opens their messaging app with it prefilled —
 * nothing is ever sent from Novara. Drafts itself once the follow-up is due
 * (and company news has settled, so a headline can be used); before that it
 * waits for a tap, so browsing contacts doesn't spend AI calls.
 */
export function SuggestedMessage({
  contact,
  headline,
  newsSettled,
  onSent,
}: {
  contact: Contact;
  headline?: string;
  newsSettled: boolean;
  onSent: () => void;
}) {
  const { getToken } = useAuth();
  const methods = availableMethods(contact);
  const [channel, setChannel] = useState<ContactMethod>(() => usablePreferred(contact) ?? methods[0] ?? "text");
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const due = !!contact.nextFollowUpDate && new Date(contact.nextFollowUpDate) <= new Date();

  const generate = useCallback(async (forChannel: ContactMethod) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchSuggestedMessage(getToken, contact.id, { channel: forChannel, headline });
      if (id !== requestId.current) return;
      setDraft(result.message);
      setSource(result.source);
      setEdited(false);
    } catch (err) {
      if (id === requestId.current) toast.error(err instanceof Error ? err.message : "Couldn't draft a message right now.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken, contact.id, headline]);

  // Auto-draft once per contact when a follow-up is due.
  const autoDrafted = useRef<string | null>(null);
  useEffect(() => {
    if (!due || !newsSettled || autoDrafted.current === contact.id) return;
    autoDrafted.current = contact.id;
    void generate(channel);
  }, [due, newsSettled, contact.id, channel, generate]);

  const pickChannel = (m: ContactMethod) => {
    if (m === channel) return;
    setChannel(m);
    // Re-size the draft for the new channel unless the user has made it theirs.
    if (draft && !edited) void generate(m);
  };

  const handleCopy = async () => {
    if (await copyText(draft)) toast.success("Message copied");
    else toast.error("Couldn't copy — select the text and copy it instead.");
  };

  const handleSend = async () => {
    if (channel === "linkedin") {
      // LinkedIn has no compose link, so the draft goes to the clipboard and
      // the profile opens from the toast (a tap, so it isn't popup-blocked).
      if (!(await copyText(draft))) {
        toast.error("Couldn't copy — select the text and copy it instead.");
        return;
      }
      toast.success("Message copied", {
        description: "Paste it into a LinkedIn message.",
        action: { label: "Open LinkedIn", onClick: () => { if (openContactMethod(contact, "linkedin")) onSent(); } },
        duration: 8000,
      });
      return;
    }
    const href = draftHref(contact, channel, draft);
    if (!href) return;
    window.location.href = href;
    onSent();
  };

  const canSend = methods.includes(channel) && draft.trim().length > 0;
  const SendIcon = METHOD_ICON[channel];

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm mb-4" data-testid="suggested-message">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Suggested message</h3>
        </div>
        {methods.length > 1 && (
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Channel">
            {methods.map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === channel}
                  aria-label={METHOD_LABEL[m]}
                  onClick={() => pickChannel(m)}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    m === channel ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/80",
                  )}
                  data-testid={`suggested-channel-${m}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!draft && !loading ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            A short draft for {contact.firstName}, based on how you met, your notes, and recent news. You review it before anything is sent.
          </p>
          <Button variant="outline" className="w-full h-12 rounded-xl font-semibold gap-2" onClick={() => void generate(channel)} data-testid="button-draft-message">
            <PenLine className="w-4 h-4" />Draft a message
          </Button>
        </>
      ) : (
        <>
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setEdited(true); }}
              rows={channel === "text" ? 5 : 8}
              disabled={loading}
              aria-label={`Suggested message to ${contact.firstName}`}
              className="leading-relaxed resize-none"
              data-testid="input-suggested-message"
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground bg-background/60 rounded-xl">
                <Loader2 className="w-4 h-4 animate-spin" />Drafting…
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            {source === "ai" ? "AI draft from your notes · check it before sending" : "Draft from this contact's details · edit to make it yours"}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="outline" className="h-11 rounded-xl font-semibold gap-1.5" onClick={() => void generate(channel)} disabled={loading} data-testid="button-regenerate-message">
              <RefreshCw className="w-4 h-4" />Regenerate
            </Button>
            <Button variant="outline" className="h-11 rounded-xl font-semibold gap-1.5" onClick={() => void handleCopy()} disabled={loading || !draft.trim()} data-testid="button-copy-message">
              <Copy className="w-4 h-4" />Copy
            </Button>
          </div>
          {methods.includes(channel) && (
            <Button className="w-full h-12 rounded-xl font-semibold gap-2 mt-2" onClick={() => void handleSend()} disabled={loading || !canSend} data-testid="button-send-message">
              <SendIcon className="w-4 h-4" />{SEND_LABEL[channel]}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
