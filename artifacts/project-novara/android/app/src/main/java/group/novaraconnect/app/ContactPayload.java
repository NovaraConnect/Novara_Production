package group.novaraconnect.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Picks the fields Novara's Add Contact form uses from one contact's rows.
 * Same choices as NovaraContactImport.swift on iOS: a work email beats a
 * personal one for a professional network, a mobile number beats a landline,
 * and only a LinkedIn web address is kept.
 */
final class ContactPayload {

    static final class Labelled {
        final String value;
        final int type;

        Labelled(String value, int type) {
            this.value = value;
            this.type = type;
        }
    }

    private ContactPayload() {}

    /** The value whose type comes earliest in {@code preferredTypes}, else the first. */
    static String preferred(List<Labelled> values, int... preferredTypes) {
        List<Labelled> present = new ArrayList<>();
        for (Labelled labelled : values) {
            if (labelled.value != null && !labelled.value.trim().isEmpty()) present.add(labelled);
        }
        for (int type : preferredTypes) {
            for (Labelled labelled : present) {
                if (labelled.type == type) return labelled.value.trim();
            }
        }
        return present.isEmpty() ? null : present.get(0).value.trim();
    }

    static String linkedIn(List<String> websites) {
        for (String url : websites) {
            if (url != null && url.toLowerCase(Locale.ROOT).contains("linkedin.com")) return url.trim();
        }
        return null;
    }
}
