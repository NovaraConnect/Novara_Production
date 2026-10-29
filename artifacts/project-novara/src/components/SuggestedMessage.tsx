import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Copy, Linkedin, Loader2, Mail, MessageSquare, PenLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchSuggestedMessage, MAX_MESSAGE_LENGTH } from "@/lib/api";
import {
  availableMethods, draftHref, openContactMethod, usablePreferred, type ContactMethod,
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
 * One ready-to-send draft for reaching out, shown near "Contact now". The
 * same message works as a text, email, or LinkedIn message (at most 500
 * characters); email also gets a subject line. The user edits it, then copies
 * it or opens their preferred channel with it prefilled — nothing is ever
 * sent from Novara. Drafted only on tap, so browsing contacts costs nothing.
 */
export function SuggestedMessage({
  contact,
  headline,
  onSent,
}: {
  contact: Contact;
  headline?: string;
  onSent: () => void;
}) {
  const { getToken } = useAuth();
  const methods = availableMethods(contact);
  const sendMethod: ContactMethod | null = usablePreferred(contact) ?? methods[0] ?? null;
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const generate = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fetchSuggestedMessage(getToken, contact.id, { headline });
      if (id !== requestId.current) return;
      setDraft(result.message.slice(0, MAX_MESSAGE_LENGTH));
      setSubject(result.subject);
      setSource(result.source);
    } catch (err) {
      if (id === requestId.current) toast.error(err instanceof Error ? err.message : "Couldn't draft a message right now.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken, contact.id, headline]);

  const handleCopy = async () => {
    if (await copyText(draft)) toast.success("Message copied");
    else toast.error("Couldn't copy — select the text and copy it instead.");
  };

  const handleSend = async () => {
    if (!sendMethod) return;
    if (sendMethod === "linkedin") {
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
    const href = draftHref(contact, sendMethod, draft, subject);
    if (!href) return;
    window.location.href = href;
    onSent();
  };

  const SendIcon = sendMethod ? METHOD_ICON[sendMethod] : Mail;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm mb-4" data-testid="suggested-message">
      <div className="flex items-center gap-2 mb-3">
        <PenLine className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Suggested message</h3>
      </div>

      {!draft && !loading ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            A short draft for {contact.firstName}, based on how you met, your notes, and recent news. You review it before anything is sent.
          </p>
          <Button variant="outline" className="w-full h-12 rounded-xl font-semibold gap-2" onClick={() => void generate()} data-testid="button-draft-message">
            <PenLine className="w-4 h-4" />Draft a message
          </Button>
        </>
      ) : (
        <>
          {sendMethod === "email" && (
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              disabled={loading}
              aria-label="Email subject"
              placeholder="Subject"
              className="mb-2 rounded-xl"
              data-testid="input-suggested-subject"
            />
          )}
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={12}
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
          <div className="flex items-start justify-between gap-3 mt-2 text-[10px] text-muted-foreground">
            <p>{source === "ai" ? "AI draft from your notes · check it before sending" : "Draft from this contact's details · edit to make it yours"}</p>
            <p className={cn("shrink-0 tabular-nums", draft.length >= MAX_MESSAGE_LENGTH && "text-cooling")}>
              {draft.length}/{MAX_MESSAGE_LENGTH}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="outline" className="h-11 rounded-xl font-semibold gap-1.5" onClick={() => void generate()} disabled={loading} data-testid="button-regenerate-message">
              <RefreshCw className="w-4 h-4" />Regenerate
            </Button>
            <Button variant="outline" className="h-11 rounded-xl font-semibold gap-1.5" onClick={() => void handleCopy()} disabled={loading || !draft.trim()} data-testid="button-copy-message">
              <Copy className="w-4 h-4" />Copy
            </Button>
          </div>
          {sendMethod && (
            <Button className="w-full h-12 rounded-xl font-semibold gap-2 mt-2" onClick={() => void handleSend()} disabled={loading || !draft.trim()} data-testid="button-send-message">
              <SendIcon className="w-4 h-4" />{SEND_LABEL[sendMethod]}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
