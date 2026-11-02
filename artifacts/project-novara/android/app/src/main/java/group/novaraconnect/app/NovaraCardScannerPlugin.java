package group.novaraconnect.app;

import android.app.Activity;
import android.graphics.Rect;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Native business-card capture. The Android twin of
 * ios/App/App/Native/NovaraCardScanner.swift, with the same answer, so the web
 * app treats both alike.
 *
 * Google's document scanner handles capture (edge detection, perspective
 * correction, front and back in one session) and needs no camera permission.
 * Google's text recognition then reads it on the device. Only the recognised
 * TEXT goes back to the web app, which runs the same extractContactFields()
 * parser, optional AI refinement and review-before-save form as every other path.
 */
@CapacitorPlugin(name = "NovaraCardScanner")
public class NovaraCardScannerPlugin extends Plugin {

    private static final int MAX_PAGES = 2; // front and back

    private static final String UNAVAILABLE = "Card scanning isn't available on this device.";
    private static final String NO_TEXT =
        "No text was found on that card — try again with more light, or enter the details manually.";
    private static final String COULD_NOT_READ = "Couldn't read that card just now — try again, or enter the details manually.";

    private ActivityResultLauncher<IntentSenderRequest> scanLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // Must be registered while the activity is being created.
        scanLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onScanFinished
        );
    }

    /** Opens the scanner. Resolves { text, pages }, or { cancelled: true }. */
    @PluginMethod
    public void scanCard(PluginCall call) {
        if (pendingCall != null) {
            call.reject("A scan is already in progress.");
            return;
        }
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(MAX_PAGES)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);

        pendingCall = call;
        scanner
            .getStartScanIntent(getActivity())
            .addOnSuccessListener(sender -> scanLauncher.launch(new IntentSenderRequest.Builder(sender).build()))
            .addOnFailureListener(error -> {
                pendingCall = null;
                call.reject(UNAVAILABLE);
            });
    }

    private void onScanFinished(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
        if (scan == null || scan.getPages() == null || scan.getPages().isEmpty()) {
            call.reject(NO_TEXT);
            return;
        }

        List<Uri> pages = new ArrayList<>();
        for (GmsDocumentScanningResult.Page page : scan.getPages()) {
            pages.add(page.getImageUri());
        }
        recognize(call, pages, 0, new ArrayList<>(), TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS));
    }

    /** Reads the pages one after another, then answers the web app. */
    private void recognize(PluginCall call, List<Uri> pages, int index, List<String> lines, TextRecognizer recognizer) {
        if (index >= pages.size()) {
            recognizer.close();
            if (lines.isEmpty()) {
                call.reject(NO_TEXT);
                return;
            }
            JSObject result = new JSObject();
            result.put("text", String.join("\n", lines));
            result.put("pages", pages.size());
            call.resolve(result);
            return;
        }

        InputImage image;
        try {
            image = InputImage.fromFilePath(getContext(), pages.get(index));
        } catch (IOException e) {
            recognizer.close();
            call.reject(COULD_NOT_READ);
            return;
        }
        int pageHeight = image.getHeight();
        recognizer
            .process(image)
            .addOnSuccessListener(text -> {
                lines.addAll(CardTextOrder.inReadingOrder(linesOf(text), pageHeight));
                recognize(call, pages, index + 1, lines, recognizer);
            })
            .addOnFailureListener(error -> {
                recognizer.close();
                call.reject(COULD_NOT_READ);
            });
    }

    private static List<CardTextOrder.Line> linesOf(Text text) {
        List<CardTextOrder.Line> lines = new ArrayList<>();
        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect box = line.getBoundingBox();
                lines.add(new CardTextOrder.Line(line.getText(), box == null ? 0 : box.top, box == null ? 0 : box.left));
            }
        }
        return lines;
    }
}
