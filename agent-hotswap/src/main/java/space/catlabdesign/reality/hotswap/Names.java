package space.catlabdesign.reality.hotswap;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/** Runtime Minecraft names the launcher resolved (`-Dreality.hotswap.names`). */
final class Names {
    final String minecraftClass;
    final String getInstance;
    final String getConnection;
    final String levelField;
    final String reloadResourcePacks;

    /** The other namespace (official vs SRG), or null when the launcher wrote none. */
    final Names alt;

    private Names(String a, String b, String c, String d, String e, Names alt) {
        minecraftClass = a; getInstance = b; getConnection = c; levelField = d; reloadResourcePacks = e;
        this.alt = alt;
    }

    /** Null when the file is missing, unreadable or lacks any key. */
    static Names load(Path file) {
        Properties p = new Properties();
        try (InputStream in = Files.newInputStream(file)) {
            p.load(in);
        } catch (IOException | RuntimeException e) {
            return null;
        }
        Names primary = from(p, "");
        if (primary == null) return null;
        Names alt = from(p, "alt.");
        return alt == null ? primary : new Names(primary.minecraftClass, primary.getInstance, primary.getConnection,
            primary.levelField, primary.reloadResourcePacks, alt);
    }

    private static Names from(Properties p, String prefix) {
        String[] v = new String[5];
        String[] keys = {"minecraft_class", "get_instance", "get_connection", "level_field", "reload_resource_packs"};
        for (int i = 0; i < keys.length; i++) {
            v[i] = p.getProperty(prefix + keys[i]);
            if (v[i] == null || v[i].trim().isEmpty()) return null;
            v[i] = v[i].trim();
        }
        return new Names(v[0], v[1], v[2], v[3], v[4], null);
    }
}
