package space.catlabdesign.reality.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * Runtime (JVM internal) names of the tab-list members for one naming scheme,
 * resolved by the launcher from Mojang + loader mappings and written to the
 * session file as scheme.&lt;i&gt;.* keys.
 */
final class TabScheme {
    final String name;
    final String overlayClass;
    final String overlayMethod;
    final String overlayDesc;
    final String playerInfoClass;
    final String getProfile;
    final String componentClass;
    final String literal;
    final String literalDesc;
    final String mutableClass;
    final String append;
    final String appendDesc;

    private TabScheme(Properties p, String prefix) {
        name = p.getProperty(prefix + "name", "");
        overlayClass = require(p, prefix + "overlay.class");
        overlayMethod = require(p, prefix + "overlay.method");
        overlayDesc = require(p, prefix + "overlay.desc");
        playerInfoClass = require(p, prefix + "playerinfo.class");
        getProfile = require(p, prefix + "getprofile");
        componentClass = require(p, prefix + "component.class");
        literal = require(p, prefix + "literal");
        literalDesc = require(p, prefix + "literal.desc");
        mutableClass = require(p, prefix + "mutable.class");
        append = require(p, prefix + "append");
        appendDesc = require(p, prefix + "append.desc");
    }

    private static String require(Properties p, String key) {
        String value = p.getProperty(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("missing " + key);
        return value;
    }

    /** Schemes with any missing key are skipped. */
    static List<TabScheme> load(Properties p) {
        List<TabScheme> schemes = new ArrayList<>();
        int count;
        try {
            count = Integer.parseInt(p.getProperty("scheme.count", "0"));
        } catch (NumberFormatException e) {
            return schemes;
        }
        for (int i = 0; i < count; i++) {
            try {
                schemes.add(new TabScheme(p, "scheme." + i + "."));
            } catch (IllegalArgumentException e) {
                System.err.println("[RealityAgent] Skipping tab scheme " + i + ": " + e.getMessage());
            }
        }
        return schemes;
    }
}
