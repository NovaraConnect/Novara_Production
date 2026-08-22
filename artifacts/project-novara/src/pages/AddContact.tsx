import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useContacts } from "@/hooks/useContacts";
import { useSettings } from "@/hooks/useSettings";
import { Contact } from "@/types/contact";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Wand2, X, Clock, RefreshCw, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { suggestPriority, suggestInitialFollowUp, deriveSuggestedCadence, MANUAL_CADENCE_OPTIONS, isPriorityLevel } from "@/lib/suggest";
import { BusinessCardScanner, type ScannedContact } from "@/components/BusinessCardScanner";
import { LinkedInScreenshotImport } from "@/components/LinkedInScreenshotImport";
import type { LinkedInDraft } from "@/lib/linkedinParse";
import { QRScanner, type ScannedQRContact } from "@/components/QRScanner";

const INITIAL_OPTIONS: Contact["initialFollowUpDays"][] = [1, 2, 3];
const CADENCE_OPTIONS: Contact["followUpCadenceDays"][] = [...MANUAL_CADENCE_OPTIONS];

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().min(1, "Company is required"),
  role: z.string().optional(),
  metAt: z.string().optional(),
  linkedinUrl: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  industry: z.string().optional(),
  function: z.string().optional(),
  preferredContactMethod: z.enum(["none", "text", "email", "linkedin"]).optional(),
  importance: z.enum(["High", "Medium", "Low"]),
  connectionStatus: z.enum(["connected", "pipeline"]),
  initialFollowUpDays: z.coerce.number().refine(val => [1,2,3].includes(val)),
  followUpCadenceDays: z.coerce.number().refine(val => [21,30,42,60,90,180].includes(val)),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

function labelDays(days: number): string {
  if (days === 1) return "24h";
  if (days === 2) return "48h";
  if (days === 3) return "72h";
  if (days === 21) return "3 weeks";
  if (days === 30) return "1 month";
  if (days === 42) return "6 weeks";
  if (days === 60) return "2 months";
  if (days === 90) return "3 months";
  if (days === 180) return "6 months";
  return `${days} days`;
}

const FREE_TIER_LIMIT = 25;

export default function AddContact() {
  const [, setLocation] = useLocation();
  const { addContact, contacts } = useContacts();
  const { settings } = useSettings();
  const [showDetails, setShowDetails] = useState(false);
  const [importanceSuggestion, setImportanceSuggestion] = useState<{ importance: "High" | "Medium" | "Low"; reason: string } | null>(null);
  const [importanceSuggestionDismissed, setImportanceSuggestionDismissed] = useState(false);
  const [initialSuggestion, setInitialSuggestion] = useState<{ days: Contact["initialFollowUpDays"]; reason: string } | null>(null);
  const [cadenceSuggestion, setCadenceSuggestion] = useState<Contact["followUpCadenceDays"] | null>(null);
  const [importanceOverridden, setImportanceOverridden] = useState(false);
  const [initialOverridden, setInitialOverridden] = useState(false);
  const [cadenceOverridden, setCadenceOverridden] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "", lastName: "", company: "", role: "", metAt: "",
      linkedinUrl: "", email: "", phone: "", industry: "", function: "", preferredContactMethod: "none",
      importance: "Medium", connectionStatus: "connected",
      initialFollowUpDays: 2, followUpCadenceDays: 42, notes: ""
    }
  });

  const role = form.watch("role");
  const company = form.watch("company");
  const industry = form.watch("industry");
  const contactFunction = form.watch("function");
  const importance = form.watch("importance");

  // Recompute the suggested priority from the full profile + contact fields
  // using the canonical source of truth. Crucially, we do NOT reset the manual
  // override here: once the user picks a priority, later company/role edits
  // refresh the suggestion shown but never overwrite their choice (task: Add
  // Contact must respect importanceOverridden).
  useEffect(() => {
    const hasInput = !!(role || company || industry || contactFunction || interests.length);
    if (!hasInput) {
      setImportanceSuggestion(null);
      return;
    }
    const suggestion = suggestPriority(
      { company: company ?? "", role: role ?? "", industry: industry ?? "", function: contactFunction ?? "", interests },
      { careerGoals: settings.careerGoals, careerStatement: settings.careerStatement, goalTags: settings.goalTags },
    );
    setImportanceSuggestion(suggestion);
    if (!importanceOverridden) form.setValue("importance", suggestion.importance);
  }, [role, company, industry, contactFunction, interests, settings.careerGoals, settings.careerStatement, settings.goalTags, importanceOverridden]);

  // Cadence follows the effective priority unless the user overrides it.
  useEffect(() => {
    const initSug = suggestInitialFollowUp(importance);
    const cadSug = deriveSuggestedCadence(importance);
    setInitialSuggestion(initSug);
    setCadenceSuggestion(cadSug);
    if (!initialOverridden) form.setValue("initialFollowUpDays", initSug.days);
    if (!cadenceOverridden) form.setValue("followUpCadenceDays", cadSug);
  }, [importance, initialOverridden, cadenceOverridden]);

  const handleQRScanned = useCallback((data: ScannedQRContact) => {
    const opts = { shouldDirty: true, shouldTouch: true } as const;
    if (data.firstName) form.setValue("firstName", data.firstName, opts);
    if (data.lastName) form.setValue("lastName", data.lastName, opts);
    if (data.company) form.setValue("company", data.company, opts);
    if (data.role) form.setValue("role", data.role, opts);
    if (data.email) form.setValue("email", data.email, opts);
    if (data.phone) form.setValue("phone", data.phone, opts);
    setImportanceSuggestionDismissed(false);
    setImportanceOverridden(false);
    setInitialOverridden(false);
    setCadenceOverridden(false);
  }, [form]);

  const handleCardScanned = useCallback((data: ScannedContact) => {
    const opts = { shouldDirty: true, shouldTouch: true } as const;
    if (data.firstName) form.setValue("firstName", data.firstName, opts);
    if (data.lastName) form.setValue("lastName", data.lastName, opts);
    if (data.company) form.setValue("company", data.company, opts);
    if (data.role) form.setValue("role", data.role, opts);
    if (data.email) form.setValue("email", data.email, opts);
    if (data.phone) form.setValue("phone", data.phone, opts);
    setImportanceSuggestionDismissed(false);
    setImportanceOverridden(false);
    setInitialOverridden(false);
    setCadenceOverridden(false);
  }, [form]);

  const handleLinkedInExtracted = useCallback((data: LinkedInDraft) => {
    const opts = { shouldDirty: true, shouldTouch: true } as const;
    if (data.firstName) form.setValue("firstName", data.firstName, opts);
    if (data.lastName) form.setValue("lastName", data.lastName, opts);
    if (data.role) form.setValue("role", data.role, opts);
    if (data.company) form.setValue("company", data.company, opts);
    if (data.linkedinUrl) form.setValue("linkedinUrl", data.linkedinUrl, opts);
    // Never sets email/phone. Append provenance/location without clobbering
    // anything the user may have already typed into notes.
    if (data.notes) {
      const existing = (form.getValues("notes") ?? "").trim();
      form.setValue("notes", existing ? `${existing}\n${data.notes}` : data.notes, opts);
    }
    setImportanceSuggestionDismissed(false);
    setImportanceOverridden(false);
    setInitialOverridden(false);
    setCadenceOverridden(false);
  }, [form]);

  const addInterest = () => {
    const trimmed = interestInput.trim();
    if (!trimmed || interests.includes(trimmed)) return;
    setInterests(prev => [...prev, trimmed]);
    setInterestInput("");
  };

  const removeInterest = (tag: string) => setInterests(prev => prev.filter(t => t !== tag));

  const atLimit = contacts.length >= FREE_TIER_LIMIT;

  const onSubmit = async (values: FormValues) => {
    if (atLimit) return;
    try {
      await addContact.mutateAsync({
        ...values,
        interests,
        // Persist manual overrides so recalculation never overwrites them.
        priorityOverride: importanceOverridden,
        currentPriority: values.importance,
        cadenceOverride: cadenceOverridden,
        preferredContactMethod: values.preferredContactMethod === "none" ? undefined : values.preferredContactMethod,
        initialFollowUpDays: values.initialFollowUpDays as Contact["initialFollowUpDays"],
        followUpCadenceDays: values.followUpCadenceDays as Contact["followUpCadenceDays"],
      } as any);
      toast.success("Contact added successfully");
      setLocation("/contacts");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("limit") || msg.includes("403")) {
        toast.error(`You've reached the ${FREE_TIER_LIMIT}-contact limit for the beta.`);
      } else {
        toast.error("Failed to save contact. Please try again.");
      }
    }
  };

  const showImportanceBanner = importanceSuggestion && !importanceSuggestionDismissed && (!!role || !!company);

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center">
        <Button variant="ghost" size="icon" className="-ml-2 mr-2" onClick={() => window.history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-serif text-xl font-bold tracking-tight text-foreground">Add Contact</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        {/* Beta contact limit wall */}
        {atLimit && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
              <span className="text-2xl">🎯</span>
            </div>
            <div>
              <p className="text-base font-bold text-foreground mb-1">You've hit the beta limit</p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                The beta supports up to {FREE_TIER_LIMIT} contacts. More capacity is coming — thanks for being an early user!
              </p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => window.history.back()}>
              Back to contacts
            </Button>
          </div>
        )}

        {!atLimit && (
          <>
            {/* Business Card Scanner */}
            <BusinessCardScanner onExtracted={handleCardScanned} />
            <p className="text-xs text-muted-foreground text-center -mt-4 mb-2">For best results — good lighting, card fills the frame, avoid glare. First scan might take 5–15 seconds</p>

            {/* LinkedIn Screenshot Import */}
            <LinkedInScreenshotImport onExtracted={handleLinkedInExtracted} />

            {/* QR Code Scanner */}
            <div className="mb-6">
              <QRScanner onExtracted={handleQRScanned} />
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* ── QUICK ADD ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl><Input placeholder="Sarah" {...field} data-testid="input-firstname" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl><Input placeholder="Jones" {...field} data-testid="input-lastname" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="company" render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <FormControl><Input placeholder="Tesla" {...field} data-testid="input-company" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Role <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Input placeholder="Recruiter" {...field} data-testid="input-role" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="metAt" render={({ field }) => (
              <FormItem>
                <FormLabel>Where did you meet? <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Input placeholder="MBA Alumni Event, LinkedIn DM…" {...field} data-testid="input-metat" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── PRIMARY SAVE ──────────────────────────────── */}
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-semibold shadow-md"
              disabled={addContact.isPending}
              data-testid="button-submit"
            >
              {addContact.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save Contact"}
            </Button>

            {/* ── DETAILS EXPANDER ──────────────────────────── */}
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border/70 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              {showDetails ? (
                <><ChevronUp className="w-4 h-4" />Hide details</>
              ) : (
                <span className="flex items-center gap-2">
                <ChevronDown className="w-4 h-4 shrink-0" />
                <span>Add more details</span>
                <span className="text-xs font-normal opacity-60">— contact info, interests, follow-up cadence</span>
              </span>
              )}
            </button>

            {/* ── DETAILS SECTION ───────────────────────────── */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${showDetails ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`}
            >
              <div className="space-y-5 pt-1">

                {/* Contact Profile */}
                <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Contact Profile</p>
                    <p className="text-xs text-muted-foreground">Used to match against your career goals and adjust priority automatically.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="industry" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <FormControl><Input placeholder="Fintech" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="function" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Function</FormLabel>
                        <FormControl><Input placeholder="Product" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div>
                    <label className="text-sm font-medium leading-none">Interests</label>
                    <div className="flex flex-wrap gap-2 mt-2 mb-2">
                      {interests.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-xs font-medium px-2.5 py-1 rounded-full">
                          {tag}
                          <button type="button" onClick={() => removeInterest(tag)} className="hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. AI, climate tech, early-stage…"
                        value={interestInput}
                        onChange={e => setInterestInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addInterest(); } }}
                        className="flex-1 text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addInterest} disabled={!interestInput.trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Importance suggestion banner */}
                {showImportanceBanner && (
                  <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <Wand2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-primary">Novara suggestion: {importanceSuggestion!.importance} priority &amp; matching cadence</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{importanceSuggestion!.reason} — you can override any value below.</p>
                    </div>
                    <button type="button" onClick={() => setImportanceSuggestionDismissed(true)} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Base Priority */}
                <FormField control={form.control} name="importance" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority{importanceOverridden ? "" : " (suggested)"}</FormLabel>
                    <Select onValueChange={(val) => { if (!isPriorityLevel(val)) return; field.onChange(val); setImportanceOverridden(true); }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-importance">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {importanceOverridden
                        ? "You set this manually — it won't be changed by goal updates."
                        : "Suggested from your career goals. Pick a value to override."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Status */}
                <FormField control={form.control} name="connectionStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        {(["connected", "pipeline"] as const).map((s) => (
                          <button key={s} type="button" onClick={() => field.onChange(s)}
                            className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${field.value === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                            {s === "connected" ? "Connected" : "Pipeline"}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Follow-up Timing */}
                <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Follow-up Timing</p>
                    <p className="text-xs text-muted-foreground">AI adjusts both windows based on how you met and how important this contact is.</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-semibold text-foreground">First reach-out</span>
                      </div>
                      {initialSuggestion && !initialOverridden && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                          <Wand2 className="w-2.5 h-2.5" />Suggested
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{initialSuggestion?.reason ?? "How soon after meeting to send your first message."}</p>
                    <FormField control={form.control} name="initialFollowUpDays" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="flex flex-wrap gap-2">
                            {INITIAL_OPTIONS.map((opt) => (
                              <button key={opt} type="button" onClick={() => { field.onChange(opt); setInitialOverridden(true); }}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${field.value === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                                data-testid={`option-initial-${opt}`}
                              >
                                {labelDays(opt)}
                              </button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="border-t border-border/50" />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Ongoing cadence</span>
                      </div>
                      {cadenceSuggestion && !cadenceOverridden && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                          <Wand2 className="w-2.5 h-2.5" />Suggested
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">How often to reconnect once you're in touch. After {settings.autoDowngradeAfterMonths} months, moves to twice-per-year maintenance.</p>
                    <FormField control={form.control} name="followUpCadenceDays" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="flex flex-wrap gap-2">
                            {CADENCE_OPTIONS.map((opt) => (
                              <button key={opt} type="button" onClick={() => { field.onChange(opt); setCadenceOverridden(true); }}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${field.value === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                                data-testid={`option-cadence-${opt}`}
                              >
                                {labelDays(opt)}
                              </button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* LinkedIn URL */}
                <FormField control={form.control} name="linkedinUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn URL <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="https://linkedin.com/in/…" {...field} data-testid="input-linkedin" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Email / Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl><Input type="email" placeholder="jane@co.com" {...field} data-testid="input-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl><Input type="tel" placeholder="+1 555 000 0000" {...field} data-testid="input-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Preferred contact method */}
                <FormField control={form.control} name="preferredContactMethod" render={({ field }) => {
                  const phone = form.watch("phone");
                  const email = form.watch("email");
                  const linkedinUrl = form.watch("linkedinUrl");
                  const missing =
                    field.value === "text" && !phone?.trim() ? "Add a phone number to use Text."
                      : field.value === "email" && !email?.trim() ? "Add an email to use Email."
                        : field.value === "linkedin" && !linkedinUrl?.trim() ? "Add a LinkedIn URL to use LinkedIn."
                          : null;
                  const opts = [
                    { value: "none", label: "None" },
                    { value: "text", label: "Text" },
                    { value: "email", label: "Email" },
                    { value: "linkedin", label: "LinkedIn" },
                  ] as const;
                  return (
                    <FormItem>
                      <FormLabel>Preferred contact method <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted p-1">
                          {opts.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => field.onChange(o.value)}
                              className={`h-9 rounded-lg text-xs font-semibold transition-colors ${field.value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                              data-testid={`preferred-${o.value}`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </FormControl>
                      {missing && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">{missing}</p>}
                      <FormMessage />
                    </FormItem>
                  );
                }} />

                {/* Notes */}
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Textarea placeholder="Discussed their recent launch…" className="resize-none h-24" {...field} data-testid="input-notes" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Save button repeated at bottom of details for convenience */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-md"
                  disabled={addContact.isPending}
                >
                  {addContact.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save Contact"}
                </Button>

              </div>
            </div>

          </form>
            </Form>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
