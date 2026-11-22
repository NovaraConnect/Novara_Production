package group.novaraconnect.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class ContactPayloadTest {

    // Same numbers as ContactsContract: Email TYPE_HOME 1, TYPE_WORK 2; Phone TYPE_HOME 1, TYPE_MOBILE 2.
    private static ContactPayload.Labelled value(String value, int type) {
        return new ContactPayload.Labelled(value, type);
    }

    @Test
    public void prefersTheTypesInOrder() {
        assertEquals("ada@acme.com", ContactPayload.preferred(
            Arrays.asList(value("ada@home.com", 1), value("ada@acme.com", 2)), 2, 1));
    }

    @Test
    public void fallsBackToTheFirstValue() {
        assertEquals("+1 555 0100", ContactPayload.preferred(
            Arrays.asList(value("+1 555 0100", 7), value("+1 555 0101", 3)), 2));
    }

    @Test
    public void skipsBlankValues() {
        assertEquals("ada@acme.com", ContactPayload.preferred(
            Arrays.asList(value("  ", 2), value(" ada@acme.com ", 1)), 2, 1));
        assertNull(ContactPayload.preferred(Collections.emptyList(), 2));
    }

    @Test
    public void keepsOnlyALinkedInAddress() {
        assertEquals("https://www.linkedin.com/in/ada", ContactPayload.linkedIn(
            Arrays.asList("https://ada.dev", "https://www.LinkedIn.com/in/ada".toLowerCase())));
        assertNull(ContactPayload.linkedIn(Collections.singletonList("https://ada.dev")));
    }
}
