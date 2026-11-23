package space.catlabdesign.reality.hotswap;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The launcher/agent channel in the session dir (schema 1, camelCase JSON).
 * Reads tolerate unknown fields and treat a missing or invalid file as absent;
 * writes go to a temp file and are renamed into place.
 */
final class Channel {
    static final long SCHEMA = 1;

    static final class Change {
        String path = "";
        int tier = 3;
        String sha256 = "";
        String action = "";
    }

    static final class Offer {
        long version;
        boolean revoked;
        String staging = "";
        List<Change> changes = new ArrayList<>();
    }

    static final class Apply {
        long version;
    }

    private final Path dir;

    Channel(Path dir) { this.dir = dir; }

    Path dir() { return dir; }

    // ---- reads ----

    private Map<?, ?> readMap(String name) {
        try {
            String text = new String(Files.readAllBytes(dir.resolve(name)), StandardCharsets.UTF_8);
            Object v = Json.parse(text);
            return v instanceof Map ? (Map<?, ?>) v : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static Long asLong(Object o) {
        return o instanceof Number ? Long.valueOf(((Number) o).longValue()) : null;
    }

    Apply readApply() {
        Map<?, ?> m = readMap("apply.json");
        if (m == null) return null;
        Long v = asLong(m.get("version"));
        if (v == null) return null;
        Apply a = new Apply();
        a.version = v;
        return a;
    }

    Offer readOffer() {
        Map<?, ?> m = readMap("offer.json");
        if (m == null) return null;
        Long v = asLong(m.get("version"));
        if (v == null) return null;
        Offer o = new Offer();
        o.version = v;
        o.revoked = Boolean.TRUE.equals(m.get("revoked"));
        if (m.get("staging") instanceof String) o.staging = (String) m.get("staging");
        if (m.get("changes") instanceof List) {
            for (Object item : (List<?>) m.get("changes")) {
                if (!(item instanceof Map)) continue;
                Map<?, ?> cm = (Map<?, ?>) item;
                if (!(cm.get("path") instanceof String)) continue;
                Change c = new Change();
                c.path = (String) cm.get("path");
                Long t = asLong(cm.get("tier"));
                c.tier = t == null ? 3 : t.intValue(); // unknown tier = needs a restart
                if (cm.get("sha256") instanceof String) c.sha256 = (String) cm.get("sha256");
                if (cm.get("action") instanceof String) c.action = (String) cm.get("action");
                o.changes.add(c);
            }
        }
        return o;
    }

    // ---- writes ----

    void writeStatus(String state, Long version) throws IOException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("schema", SCHEMA);
        m.put("state", state);
        m.put("version", version);
        write("status.json", m);
    }

    void writeResult(long version, String outcome, List<String> applied, List<String> restart, String error)
            throws IOException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("schema", SCHEMA);
        m.put("version", version);
        m.put("outcome", outcome);
        m.put("applied", applied);
        m.put("restart", restart);
        m.put("error", error);
        write("result.json", m);
    }

    /** Temp file in the same dir, fsync, then rename over the target. */
    void write(String name, Object json) throws IOException {
        Files.createDirectories(dir);
        Path tmp = dir.resolve("." + name + ".tmp");
        try {
            try (FileChannel f = FileChannel.open(tmp, StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                    StandardOpenOption.TRUNCATE_EXISTING)) {
                f.write(java.nio.ByteBuffer.wrap(Json.write(json).getBytes(StandardCharsets.UTF_8)));
                f.force(true);
            }
            try {
                Files.move(tmp, dir.resolve(name), StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
        }
    }
}
