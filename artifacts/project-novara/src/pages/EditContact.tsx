import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useContacts } from "@/hooks/useContacts";
import { Contact } from "@/types/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, RefreshCw, Loader2, Plus, X, TrendingUp, TrendingDown, Minus, Wand2 } from "lucide-react";
import { suggestInitialFollowUp, suggestPriority, deriveSuggestedCadence, MANUAL_CADENCE_OPTIONS, resolveFormPriority, isPriorityLevel } from "@/lib/suggest";
import { useSettings } from "@/hooks/useSettings";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { ImportanceBadge, priorityColors } from "@/components/ImportanceBadge";
import { cn } from "@/lib/utils";

const INITIAL_OPTIONS: Contact["initialFollowUpDays"][] = [1, 2, 3];
const CADENCE_OPTIONS: Contact["followUpCadenceDays"][] = [...MANUAL_CADENCE_OPTIONS];

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
  importance: z.enum(["High", "Medium", "Low"]),
  connectionStatus: z.enum(["connected", "pipeline"]),
  initialFollowUpDays: z.coerce.number().refine(val => [1,2,3].includes(val)),
  followUpCadenceDays: z.coerce.number().refine(val => [21,30,42,60,90,180].includes(val)),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

export default function EditContact() {
  const [match, params] = useRoute("/contacts/:id/edit");
  const [, setLocation] = useLocation();
  const { contacts, updateContact } = useContacts();
  const { settings } = useSettings();

  const contact = match && params?.id ? contacts.find(c => c.id === params.id) : null;

  useEffect(() => {
    if (!contact && contacts.length > 0) {
      setLocation("/contacts");
    }
  }, [contact, contacts.length, setLocation]);

  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [priorityOverride, setPriorityOverride] = useState(false);
  const [overridePriority, setOverridePriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [cadenceOverride, setCadenceOverride] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "", lastName: "", company: "", role: "", metAt: "",
      linkedinUrl: "", email: "", phone: "", industry: "", function: "",
      importance: "Medium", connectionStatus: "connected" as const,
      initialFollowUpDays: 2, followUpCadenceDays: 21, notes: ""
    }
  });

  const importance = form.watch("importance");
  const watchedInitial = form.watch("initialFollowUpDays");
  const watchedCadence = form.watch("followUpCadenceDays");
  const watchedCompany = form.watch("company");
  const watchedRole = form.watch("role");
  const watchedIndustry = form.watch("industry");
  const watchedFunction = form.watch("function");

  useEffect(() => {
    if (contact) {
      form.reset({
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        role: contact.role ?? "",
        metAt: contact.metAt ?? "",
        linkedinUrl: contact.linkedinUrl ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        industry: contact.industry ?? "",
        function: contact.function ?? "",
        importance: resolveFormPriority(contact),
        connectionStatus: contact.connectionStatus ?? "connected",
        initialFollowUpDays: contact.initialFollowUpDays,
        followUpCadenceDays: contact.followUpCadenceDays,
        notes: contact.notes ?? ""
      });
      setInterests(contact.interests ?? []);
      setPriorityOverride(contact.priorityOverride ?? false);
      setOverridePriority(contact.currentPriority ?? contact.importance);
      setCadenceOverride(contact.cadenceOverride ?? false);
    }
  }, [contact?.id, contact?.followUpCadenceDays, contact?.initialFollowUpDays]);

  // Keep cadence synced to the effective priority unless it's manually
  // overridden. Changing priority (base, override, or via edited fields)
  // updates the cadence — but only when cadenceOverride is false.
  useEffect(() => {
    if (cadenceOverride) return;
    const sp = suggestPriority(
      { company: watchedCompany, role: watchedRole, industry: watchedIndustry, function: watchedFunction, interests },
      { careerGoals: settings.careerGoals, careerStatement: settings.careerStatement, goalTags: settings.goalTags },
    ).importance;
    const eff = priorityOverride ? overridePriority : sp;
    form.setValue("followUpCadenceDays", deriveSuggestedCadence(eff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceOverride, priorityOverride, overridePriority, watchedCompany, watchedRole, watchedIndustry, watchedFunction, interests, settings.careerGoals, settings.careerStatement, settings.goalTags]);

  const useAutomaticCadence = () => {
    setCadenceOverride(false);
    toast.success("Cadence now follows priority automatically");
  };

  const addInterest = () => {
    const trimmed = interestInput.trim();
    if (!trimmed || interests.includes(trimmed)) return;
    setInterests(prev => [...prev, trimmed]);
    setInterestInput("");
  };

  const removeInterest = (tag: string) => setInterests(prev => prev.filter(t => t !== tag));

  const onSubmit = async (values: FormValues) => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        data: {
          ...values,
          interests,
          priorityOverride,
          currentPriority: priorityOverride ? overridePriority : undefined,
          cadenceOverride,
          initialFollowUpDays: values.initialFollowUpDays as Contact["initialFollowUpDays"],
          followUpCadenceDays: values.followUpCadenceDays as Contact["followUpCadenceDays"],
        } as any
      });
      toast.success("Contact updated");
      setLocation(`/contacts/${contact.id}`);
    } catch {
      toast.error("Failed to update contact.");
    }
  };

  if (!contact) {
    return (
      <div className="mobile-container flex items-center justify-center min-h-[100dvh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use live form values so priority recalculates as the user edits any field.
  // basePriority comes from the watched importance dropdown, not the saved contact.
  const basePriority = importance;

  const hasCareerProfile =
    (settings.careerGoals?.length ?? 0) > 0 ||
    (settings.goalTags?.length ?? 0) > 0 ||
    !!settings.careerStatement?.trim();

  // The frontend preview uses the IDENTICAL canonical function the backend
  // writes with, so what you see here is exactly what will be stored.
  const suggestedPriority = suggestPriority(
    {
      company: watchedCompany,
      role: watchedRole,
      industry: watchedIndustry,
      function: watchedFunction,
      interests,
    },
    { careerGoals: settings.careerGoals, careerStatement: settings.careerStatement, goalTags: settings.goalTags },
  ).importance;

  // effectivePriority = manualPriorityOverride ?? aiSuggestedPriority
  const currentPriority = priorityOverride ? overridePriority : suggestedPriority;

  const isPrioritized = suggestedPriority !== basePriority;
  const isUp = isPrioritized && (
    (currentPriority === "High" && basePriority !== "High") ||
    (currentPriority === "Medium" && basePriority === "Low")
  );
  const isDown = isPrioritized && !isUp;

  // Suggestions are derived from the EFFECTIVE priority so they always match
  // what the server writes to the DB via recalculation.
  const initialSuggestion = suggestInitialFollowUp(currentPriority);
  const cadenceSuggestion = deriveSuggestedCadence(currentPriority);

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center">
        <Button variant="ghost" size="icon" className="-ml-2 mr-2" onClick={() => window.history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-serif text-xl font-bold tracking-tight text-foreground">Edit Contact</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <FormField control={form.control} name="company" render={({ field }) => (
              <FormItem><FormLabel>Company</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem><FormLabel>Role (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <FormField control={form.control} name="metAt" render={({ field }) => (
              <FormItem><FormLabel>Where did you meet?</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            {/* Contact Profile for dynamic priority */}
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
                    placeholder="e.g. AI, climate tech…"
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

            {/* Priority section */}
            <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</p>

              <FormField control={form.control} name="importance" render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Priority</FormLabel>
                  <Select onValueChange={(val) => { if (isPriorityLevel(val)) field.onChange(val); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Current priority display */}
              {!priorityOverride && (
                <div className={cn(
                  "rounded-xl p-3 border",
                  isPrioritized && isUp ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30" :
                  isPrioritized && isDown ? "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30" :
                  "bg-background/60 border-border/40"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Current Priority</p>
                      <div className="flex items-center gap-1.5">
                        {isUp && <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}
                        {isDown && <TrendingDown className="w-3.5 h-3.5 text-amber-600" />}
                        {!isPrioritized && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className={cn(
                          "text-sm font-semibold",
                          isUp ? "text-emerald-700 dark:text-emerald-400" :
                          isDown ? "text-amber-700 dark:text-amber-400" :
                          "text-foreground"
                        )}>
                          {currentPriority}
                        </span>
                      </div>
                    </div>
                    <ImportanceBadge importance={currentPriority} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {isPrioritized
                      ? isUp
                        ? "Boosted — aligned with your career goals"
                        : "Reduced — less aligned with your career goals"
                      : hasCareerProfile
                        ? "Matches base priority"
                        : "Add a career statement in Settings to enable dynamic adjustment"}
                  </p>
                </div>
              )}

              {/* Override toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setPriorityOverride(prev => !prev)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className={cn(
                    "w-8 h-4 rounded-full transition-colors relative",
                    priorityOverride ? "bg-primary" : "bg-border"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
                      priorityOverride ? "translate-x-4" : "translate-x-0.5"
                    )} />
                  </div>
                  Manual override
                </button>

                {priorityOverride && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">Override Current Priority to:</p>
                    <div className="flex gap-2">
                      {(["High", "Medium", "Low"] as const).map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setOverridePriority(level)}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors",
                            overridePriority === level
                              ? cn(priorityColors(level), "border-transparent")
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Career goal changes won't affect this contact while override is on.</p>
                  </div>
                )}
              </div>
            </div>

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

            <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Follow-up Timing</p>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-semibold text-foreground">First reach-out</span>
                  </div>
                  {initialSuggestion && initialSuggestion.days !== watchedInitial && (
                    <button type="button" onClick={() => { form.setValue("initialFollowUpDays", initialSuggestion.days); toast.success(`First follow-up set to ${labelDays(initialSuggestion.days)}`); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Wand2 className="w-3 h-3" />Suggest {labelDays(initialSuggestion.days)}
                    </button>
                  )}
                </div>
                <FormField control={form.control} name="initialFollowUpDays" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex flex-wrap gap-2">
                        {INITIAL_OPTIONS.map((opt) => (
                          <button key={opt} type="button" onClick={() => field.onChange(opt)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${field.value === opt ? "bg-primary text-primary-foreground border-primary" : initialSuggestion?.days === opt ? "border-primary/50 text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                            {labelDays(opt)}{initialSuggestion?.days === opt && field.value !== opt && <span className="ml-1 text-primary text-xs">✦</span>}
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
                  {cadenceOverride ? (
                    <button type="button" onClick={useAutomaticCadence} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Wand2 className="w-3 h-3" />Use automatic cadence
                    </button>
                  ) : (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                      Automatic · {labelDays(cadenceSuggestion)}
                    </span>
                  )}
                </div>
                <FormField control={form.control} name="followUpCadenceDays" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex flex-wrap gap-2">
                        {CADENCE_OPTIONS.map((opt) => (
                          <button key={opt} type="button" onClick={() => { field.onChange(opt); setCadenceOverride(true); }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${field.value === opt ? "bg-primary text-primary-foreground border-primary" : (!cadenceOverride && cadenceSuggestion === opt) ? "border-primary/50 text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                            {labelDays(opt)}{!cadenceOverride && cadenceSuggestion === opt && field.value !== opt && <span className="ml-1 text-primary text-xs">✦</span>}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <FormField control={form.control} name="linkedinUrl" render={({ field }) => (
              <FormItem><FormLabel>LinkedIn URL (Optional)</FormLabel><FormControl><Input placeholder="https://linkedin.com/in/..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Optional)</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (Optional)</FormLabel>
                  <FormControl><Input type="tel" placeholder="+1 555 000 0000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (Optional)</FormLabel>
                <FormControl><Textarea className="resize-none h-24" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold shadow-md" disabled={updateContact.isPending}>
              {updateContact.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save Changes"}
            </Button>
          </form>
        </Form>
      </main>
    </div>
  );
}
