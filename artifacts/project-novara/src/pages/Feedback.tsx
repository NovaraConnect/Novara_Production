import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useUser } from "@clerk/react";

import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useFeedback } from "@/hooks/useFeedback";

// Matches the version shown in the Settings footer -- this app has no build-time
// git commit / package version injected into the frontend bundle, so this is
// the same "source of truth" already displayed to users elsewhere.
const APP_VERSION = "2.0.0";

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "general", label: "General feedback" },
] as const;

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature", "general"]),
  subject: z.string().min(1, "Subject is required").max(200, "Keep it under 200 characters"),
  description: z
    .string()
    .min(1, "Please describe your feedback")
    .max(5000, "Keep it under 5000 characters"),
  contactEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  mayContact: z.boolean(),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

function initialTypeFromSearch(search: string): FeedbackFormValues["type"] {
  const params = new URLSearchParams(search);
  const requested = params.get("type");
  if (requested === "bug" || requested === "feature" || requested === "general") {
    return requested;
  }
  return "general";
}

export default function Feedback() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useUser();
  const { submit } = useFeedback();

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      type: initialTypeFromSearch(search),
      subject: "",
      description: "",
      contactEmail: user?.primaryEmailAddress?.emailAddress ?? "",
      mayContact: true,
    },
  });

  const onSubmit = async (values: FeedbackFormValues) => {
    // react-hook-form + the mutation's own isPending guard (disabling the
    // submit button below) together prevent duplicate submissions from
    // repeated clicks -- the button is disabled the instant a submit begins.
    const isBugReport = values.type === "bug";

    try {
      await submit.mutateAsync({
        type: values.type,
        subject: values.subject.trim(),
        description: values.description.trim(),
        contactEmail: values.contactEmail || undefined,
        mayContact: values.mayContact,
        // Diagnostic context is only collected for bug reports, and only
        // ever the current route, browser UA string, and app version --
        // never passwords, tokens, headers, or cookies.
        pageUrl: isBugReport ? window.location.pathname : undefined,
        userAgent: isBugReport ? navigator.userAgent : undefined,
        appVersion: isBugReport ? APP_VERSION : undefined,
      });
      toast.success("Thank you! Your feedback has been sent to the Novara team.");
      form.reset({
        type: initialTypeFromSearch(search),
        subject: "",
        description: "",
        contactEmail: user?.primaryEmailAddress?.emailAddress ?? "",
        mayContact: true,
      });
      setLocation("/settings");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Too many")) {
        toast.error("You've submitted a lot of feedback recently — please try again later.");
      } else {
        toast.error("Failed to send feedback. Please try again.");
      }
    }
  };

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center">
        <Button variant="ghost" size="icon" className="-ml-2 mr-2" onClick={() => setLocation("/settings")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-serif text-xl font-bold tracking-tight text-foreground">Send Feedback</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <p className="text-sm text-muted-foreground mb-6">
          Found a bug, have a feature idea, or just want to tell us something? We read every submission.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-feedback-type">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FEEDBACK_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Short summary" {...field} data-testid="input-feedback-subject" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What happened, or what would you like to see?"
                      className="resize-none h-32 text-sm"
                      {...field}
                      data-testid="input-feedback-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Contact email <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" {...field} data-testid="input-feedback-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mayContact"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-xl border border-border/60 p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-may-contact"
                    />
                  </FormControl>
                  <div className="space-y-0.5 leading-none">
                    <FormLabel className="font-normal">May we contact you about this?</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-semibold shadow-md gap-2"
              disabled={submit.isPending}
              data-testid="button-submit-feedback"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Feedback
                </>
              )}
            </Button>
          </form>
        </Form>
      </main>

      <BottomNav />
    </div>
  );
}
