package group.novaraconnect.app;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NovaraPurchasesPlugin.class);
        // google-services.json becomes this resource at build time.
        if (getResources().getIdentifier("google_app_id", "string", getPackageName()) != 0) {
            registerPlugin(NovaraPushPlugin.class);
        }
        super.onCreate(savedInstanceState);
    }

    /**
     * The activity handles uiMode changes itself (see AndroidManifest), so the
     * theme's status bar colours would stay as they were at launch when the
     * phone switches between light and dark. The page follows the phone, so
     * the system bar icons are re-tinted to match.
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean dark = (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
    }
}
