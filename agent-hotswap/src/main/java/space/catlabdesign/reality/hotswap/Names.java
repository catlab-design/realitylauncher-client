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

    private Names(String a, String b, String c, String d, String e) {
        minecraftClass = a; getInstance = b; getConnection = c; levelField = d; reloadResourcePacks = e;
    }

    /** Null when the file is missing, unreadable or lacks any key. */
    static Names load(Path file) {
        Properties p = new Properties();
        try (InputStream in = Files.newInputStream(file)) {
            p.load(in);
        } catch (IOException | RuntimeException e) {
            return null;
        }
        String[] v = new String[5];
        String[] keys = {"minecraft_class", "get_instance", "get_connection", "level_field", "reload_resource_packs"};
        for (int i = 0; i < keys.length; i++) {
            v[i] = p.getProperty(keys[i]);
            if (v[i] == null || v[i].trim().isEmpty()) return null;
            v[i] = v[i].trim();
        }
        return new Names(v[0], v[1], v[2], v[3], v[4]);
    }
}
