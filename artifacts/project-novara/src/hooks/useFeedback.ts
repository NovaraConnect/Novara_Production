import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { submitFeedback, type FeedbackSubmission } from "@/lib/api";

export function useFeedback() {
  const { getToken } = useAuth();

  const submit = useMutation({
    mutationFn: (data: FeedbackSubmission) => submitFeedback(getToken, data),
  });

  return { submit };
}
