package space.catlabdesign.reality.hotswap;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Test-side stand-in for the launcher: writes offer/apply, reads status/result. */
final class H {
    private H() {}

    static void offer(Channel c, long version, boolean revoked, String staging, String path, int tier) throws Exception {
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("path", path);
        change.put("tier", (long) tier);
        change.put("sha256", "");
        change.put("action", "update");
        List<Object> changes = new ArrayList<>();
        changes.add(change);
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("schema", 1L);
        o.put("version", version);
        o.put("revoked", revoked);
        o.put("changes", changes);
        o.put("staging", staging);
        c.write("offer.json", o);
    }

    static void apply(Channel c, long version) throws Exception {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("schema", 1L);
        o.put("version", version);
        c.write("apply.json", o);
        // Distinct mtime so a repeated Apply of the same version is a new click.
        Files.setLastModifiedTime(c.dir().resolve("apply.json"),
            java.nio.file.attribute.FileTime.fromMillis(System.nanoTime() / 1000));
    }

    private static Map<?, ?> read(Channel c, String name) throws Exception {
        return (Map<?, ?>) Json.parse(new String(Files.readAllBytes(c.dir().resolve(name)), StandardCharsets.UTF_8));
    }

    static String status(Channel c) throws Exception { return (String) read(c, "status.json").get("state"); }
    static String outcome(Channel c) throws Exception { return (String) read(c, "result.json").get("outcome"); }
    static String error(Channel c) throws Exception { return (String) read(c, "result.json").get("error"); }
}
