package group.novaraconnect.app;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class CardTextOrderTest {

    private static CardTextOrder.Line line(String text, int top, int left) {
        return new CardTextOrder.Line(text, top, left);
    }

    @Test
    public void readsTopToBottomWhateverOrderTheyArrive() {
        List<String> ordered = CardTextOrder.inReadingOrder(
            Arrays.asList(line("ada@acme.com", 300, 10), line("Ada Lovelace", 100, 10), line("Engineer", 200, 10)),
            1000
        );
        assertEquals(Arrays.asList("Ada Lovelace", "Engineer", "ada@acme.com"), ordered);
    }

    @Test
    public void readsLeftToRightWithinARow() {
        List<String> ordered = CardTextOrder.inReadingOrder(
            Arrays.asList(line("Acme", 105, 500), line("Ada", 100, 10)),
            1000
        );
        assertEquals(Arrays.asList("Ada", "Acme"), ordered);
    }

    @Test
    public void linesFurtherApartThanARowStaySeparate() {
        List<String> ordered = CardTextOrder.inReadingOrder(
            Arrays.asList(line("Right", 100, 500), line("Left lower", 130, 10)),
            1000
        );
        assertEquals(Arrays.asList("Right", "Left lower"), ordered);
    }

    @Test
    public void dropsBlankLinesAndTrims() {
        List<String> ordered = CardTextOrder.inReadingOrder(
            Arrays.asList(line("  Ada  ", 100, 10), line("   ", 200, 10)),
            1000
        );
        assertEquals(Collections.singletonList("Ada"), ordered);
    }

    @Test
    public void closesSpacesAroundTheAtSignSoTheEmailParses() {
        List<String> ordered = CardTextOrder.inReadingOrder(
            Arrays.asList(line("ada.lovelace @example.com", 100, 10), line("grace @ example.com", 200, 10)),
            1000
        );
        assertEquals(Arrays.asList("ada.lovelace@example.com", "grace@example.com"), ordered);
    }

    @Test
    public void handlesAManyLineCardWithoutThrowing() {
        // A comparison with a tolerance can make Java's sort throw on inputs like this.
        List<CardTextOrder.Line> lines = new ArrayList<>();
        for (int i = 0; i < 200; i++) lines.add(line("l" + i, (i * 37) % 500, (i * 91) % 300));
        assertEquals(200, CardTextOrder.inReadingOrder(lines, 1000).size());
    }
}
