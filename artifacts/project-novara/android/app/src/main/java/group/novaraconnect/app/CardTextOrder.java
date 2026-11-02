package group.novaraconnect.app;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Puts recognised lines in reading order: top to bottom, then left to right.
 *
 * Reading order matters because extractContactFields() in the web app is a
 * line-oriented parser that treats "the line after the name" as the role, and
 * recognised text comes back in no guaranteed order. Lines are grouped into
 * rows first, rather than compared with a tolerance, because a comparison with
 * a tolerance isn't consistent and Java's sort can throw on it.
 */
final class CardTextOrder {

    /** Text within this share of the page height counts as one row, as on iOS. */
    private static final double SAME_ROW = 0.02;

    static final class Line {
        final String text;
        final int top;
        final int left;

        Line(String text, int top, int left) {
            this.text = text;
            this.top = top;
            this.left = left;
        }
    }

    private CardTextOrder() {}

    /**
     * Text recognition can read "ada@acme.com" as "ada @acme.com", and the web
     * app's parser, which is shared with iOS, then finds no email at all.
     */
    private static String tidy(String text) {
        return text.trim().replaceAll("\\s*@\\s*", "@");
    }

    static List<String> inReadingOrder(List<Line> lines, int pageHeight) {
        List<Line> byTop = new ArrayList<>(lines);
        byTop.sort(Comparator.comparingInt(line -> line.top));

        List<String> ordered = new ArrayList<>();
        double tolerance = pageHeight * SAME_ROW;
        int start = 0;
        while (start < byTop.size()) {
            int rowTop = byTop.get(start).top;
            int end = start;
            while (end < byTop.size() && byTop.get(end).top - rowTop <= tolerance) end++;
            List<Line> row = new ArrayList<>(byTop.subList(start, end));
            row.sort(Comparator.comparingInt(line -> line.left));
            for (Line line : row) {
                String text = tidy(line.text);
                if (!text.isEmpty()) ordered.add(text);
            }
            start = end;
        }
        return ordered;
    }
}
