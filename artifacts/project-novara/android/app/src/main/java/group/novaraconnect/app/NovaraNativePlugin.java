package group.novaraconnect.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Email;
import android.provider.ContactsContract.CommonDataKinds.Organization;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.CommonDataKinds.Website;
import android.provider.Settings;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The Android side of the features the iOS shell offers through
 * window.NovaraNative: contact import, sharing a file, the rating prompt,
 * haptics and opening Novara's settings. The web app builds the same bridge
 * shape from it (src/lib/nativeBridge.ts), so both apps are treated alike.
 */
@CapacitorPlugin(
    name = "NovaraNative",
    permissions = @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
)
public class NovaraNativePlugin extends Plugin {

    /** Matches the size the app stores (src/lib/contactPhoto.ts) and iOS. */
    private static final int PHOTO_SIZE = 192;
    private static final String UNREADABLE = "That contact couldn't be read. Please enter the details manually.";
    private static final String CONTACTS_DENIED =
        "Novara needs permission to read the contact you choose. You can allow Contacts for Novara in your phone's Settings.";

    private ActivityResultLauncher<Intent> pickLauncher;
    private PluginCall pendingPick;

    @Override
    public void load() {
        // Must be registered while the activity is being created.
        pickLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::onContactPicked
        );
    }

    // ---- Contact import -----------------------------------------------------

    /**
     * Opens the system contact picker and returns the one contact chosen.
     *
     * Unlike iOS, Android's picker only lets Novara read the chosen contact's
     * name, not its email, phone or company. So Novara asks for contacts
     * permission first, then reads only the contact the user picks, as iOS
     * does in its own fallback path. Nothing else in the address book is read.
     */
    @PluginMethod
    public void pickContact(PluginCall call) {
        if (pendingPick != null) {
            call.reject("The contact picker is already open.");
            return;
        }
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermissionResult");
            return;
        }
        openPicker(call);
    }

    @PermissionCallback
    private void contactsPermissionResult(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            openPicker(call);
        } else {
            call.reject(CONTACTS_DENIED);
        }
    }

    private void openPicker(PluginCall call) {
        pendingPick = call;
        try {
            pickLauncher.launch(new Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI));
        } catch (Exception e) {
            pendingPick = null;
            call.reject("Couldn't open your contacts. Please type the details in.");
        }
    }

    private void onContactPicked(ActivityResult result) {
        PluginCall call = pendingPick;
        pendingPick = null;
        if (call == null) return;

        Uri contactUri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || contactUri == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        try {
            call.resolve(readContact(contactUri));
        } catch (SecurityException e) {
            call.reject(UNREADABLE);
        }
    }

    private JSObject readContact(Uri contactUri) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri entityUri = Uri.withAppendedPath(contactUri, ContactsContract.Contacts.Entity.CONTENT_DIRECTORY);
        String[] projection = {
            ContactsContract.Contacts.Entity.MIMETYPE,
            ContactsContract.Contacts.Entity.DATA1,
            ContactsContract.Contacts.Entity.DATA2,
            ContactsContract.Contacts.Entity.DATA3,
            ContactsContract.Contacts.Entity.DATA4,
        };

        String firstName = null, lastName = null, company = null, role = null;
        List<ContactPayload.Labelled> emails = new ArrayList<>();
        List<ContactPayload.Labelled> phones = new ArrayList<>();
        List<String> websites = new ArrayList<>();

        try (Cursor cursor = resolver.query(entityUri, projection, null, null, null)) {
            if (cursor == null) throw new SecurityException("No cursor");
            while (cursor.moveToNext()) {
                String mime = cursor.getString(0);
                if (mime == null) continue;
                switch (mime) {
                    case StructuredName.CONTENT_ITEM_TYPE:
                        if (firstName == null) firstName = blankToNull(cursor.getString(2));
                        if (lastName == null) lastName = blankToNull(cursor.getString(3));
                        break;
                    case Organization.CONTENT_ITEM_TYPE:
                        if (company == null) company = blankToNull(cursor.getString(1));
                        if (role == null) role = blankToNull(cursor.getString(4));
                        break;
                    case Email.CONTENT_ITEM_TYPE:
                        emails.add(new ContactPayload.Labelled(cursor.getString(1), cursor.getInt(2)));
                        break;
                    case Phone.CONTENT_ITEM_TYPE:
                        phones.add(new ContactPayload.Labelled(cursor.getString(1), cursor.getInt(2)));
                        break;
                    case Website.CONTENT_ITEM_TYPE:
                        websites.add(cursor.getString(1));
                        break;
                    default:
                        break;
                }
            }
        }

        JSObject payload = new JSObject();
        putIfPresent(payload, "firstName", firstName);
        putIfPresent(payload, "lastName", lastName);
        putIfPresent(payload, "company", company);
        putIfPresent(payload, "role", role);
        putIfPresent(payload, "email", ContactPayload.preferred(emails, Email.TYPE_WORK, Email.TYPE_HOME));
        putIfPresent(payload, "phone", ContactPayload.preferred(phones, Phone.TYPE_MOBILE, Phone.TYPE_WORK_MOBILE, Phone.TYPE_MAIN, Phone.TYPE_WORK));
        putIfPresent(payload, "linkedinUrl", ContactPayload.linkedIn(websites));
        putIfPresent(payload, "photo", squarePhoto(resolver, contactUri));
        return payload;
    }

    /** The contact's photo as the small square JPEG data URL Novara stores. */
    private static String squarePhoto(ContentResolver resolver, Uri contactUri) {
        try (InputStream stream = ContactsContract.Contacts.openContactPhotoInputStream(resolver, contactUri, true)) {
            if (stream == null) return null;
            Bitmap image = BitmapFactory.decodeStream(stream);
            if (image == null || image.getWidth() == 0 || image.getHeight() == 0) return null;
            int side = Math.min(image.getWidth(), image.getHeight());
            Bitmap square = Bitmap.createBitmap(image, (image.getWidth() - side) / 2, (image.getHeight() - side) / 2, side, side);
            Bitmap scaled = Bitmap.createScaledBitmap(square, PHOTO_SIZE, PHOTO_SIZE, true);
            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 82, jpeg);
            return "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            // A missing photo never stops the import.
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static void putIfPresent(JSObject object, String key, String value) {
        if (value != null) object.put(key, value);
    }

    // ---- Sharing a file -----------------------------------------------------

    /** Hands a text file (the contacts CSV) to Android's share sheet. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "novara-export.csv");
        String text = call.getString("text", "");
        // Only a plain file name, so the path can't leave the exports folder.
        String safeName = name.replaceAll("[^A-Za-z0-9._-]", "_");
        try {
            File folder = new File(getContext().getCacheDir(), "exports");
            if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("No exports folder");
            // An export is a copy of the user's contacts, so earlier ones aren't kept.
            File[] earlier = folder.listFiles();
            if (earlier != null) {
                for (File old : earlier) old.delete();
            }
            File file = new File(folder, safeName);
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType(safeName.endsWith(".csv") ? "text/csv" : "text/plain")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TITLE, safeName)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, null));
            // Android doesn't report whether the user went on to share it.
            JSObject result = new JSObject();
            result.put("shared", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Couldn't export your contacts. Please try again.");
        }
    }

    // ---- Rating prompt ------------------------------------------------------

    /**
     * Asks Google Play for its in-app rating prompt. Like iOS, Play decides
     * whether it actually appears, and never says.
     */
    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            JSObject result = new JSObject();
            if (!request.isSuccessful() || getActivity() == null) {
                result.put("requested", false);
                call.resolve(result);
                return;
            }
            manager.launchReviewFlow(getActivity(), request.getResult()).addOnCompleteListener(flow -> {
                result.put("requested", true);
                call.resolve(result);
            });
        });
    }

    // ---- Haptics and settings -----------------------------------------------

    /** Light feedback, using the phone's own haptics. Needs no permission. */
    @PluginMethod
    public void haptic(PluginCall call) {
        int feedback = feedbackFor(call.getString("style", "selection"));
        getActivity().runOnUiThread(() -> getBridge().getWebView().performHapticFeedback(feedback));
        call.resolve();
    }

    private static int feedbackFor(String style) {
        boolean modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        switch (style) {
            case "success":
                return modern ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
            case "warning":
            case "error":
                return modern ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            case "light":
                return HapticFeedbackConstants.VIRTUAL_KEY;
            default:
                return HapticFeedbackConstants.CLOCK_TICK;
        }
    }

    /** Opens Novara's page in the phone's settings, for permission problems. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", getContext().getPackageName(), null));
        getActivity().startActivity(intent);
        call.resolve();
    }
}
