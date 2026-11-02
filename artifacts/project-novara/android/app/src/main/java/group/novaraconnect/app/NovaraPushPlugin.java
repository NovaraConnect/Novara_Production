package group.novaraconnect.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app this build can use push. The site is loaded remotely, so
 * builds without Firebase can run the same code, and registering for push on
 * one of those crashes. MainActivity only adds this plugin when the build has
 * its Firebase configuration, so its presence is the answer. The push work
 * itself is done by @capacitor/push-notifications.
 */
@CapacitorPlugin(name = "NovaraPush")
public class NovaraPushPlugin extends Plugin {}
