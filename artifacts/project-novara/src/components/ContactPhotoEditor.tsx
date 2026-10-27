import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@/types/contact";
import { ContactAvatar } from "@/components/ContactAvatar";
import { CONTACTS_KEY } from "@/hooks/useContacts";
import { removeContactPhoto, setContactPhoto } from "@/lib/api";
import { squarePhotoFromFile } from "@/lib/contactPhoto";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The large avatar on a contact's page, with a camera button to add, change
 * or remove their photo. The photo replaces the initials everywhere the
 * contact appears.
 */
export function ContactPhotoEditor({ contact }: { contact: Contact }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (work: () => Promise<Contact>, done: string) => {
    setBusy(true);
    try {
      const updated = await work();
      queryClient.setQueryData<Contact[]>(CONTACTS_KEY, (list) =>
        list?.map((c) => (c.id === updated.id ? updated : c)),
      );
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await save(async () => setContactPhoto(getToken, contact.id, await squarePhotoFromFile(file)), "Photo added");
  };

  const choose = () => inputRef.current?.click();

  return (
    <div className="relative inline-block">
      <ContactAvatar firstName={contact.firstName} lastName={contact.lastName} photo={contact.photo} size={80} />
      {contact.photo ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={choose}>Choose a new photo</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => save(() => removeContactPhoto(getToken, contact.id), "Photo removed")}
              className="text-destructive focus:text-destructive"
            >
              Remove photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          onClick={choose}
          disabled={busy}
          aria-label="Add photo"
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-hidden />
    </div>
  );
}
