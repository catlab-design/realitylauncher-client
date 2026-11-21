package space.catlabdesign.reality.agent;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Called from the patched tab list for every player row on every frame:
 * GameProfile -> badge prefix ("" when unknown or not a Reality player).
 * Never blocks and never throws; lookups run on a daemon thread.
 */
public final class TabBadges implements Function<Object, Object> {
    static final int MAX_BATCH = 100;
    static final long CACHE_MS = 60_000;
    static final long POLL_MS = 2_000;
    private static final Pattern UUID_PATTERN =
            Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Pattern NAME_PATTERN = Pattern.compile("[A-Za-z0-9_]{1,16}");

    private final File sessionFile;
    private final String badge;
    /**
     * Badge drawn left of the head (negative space, glyph, positive space) and
     * how far the head moves right to make room; null/0 when the font can't do it.
     */
    private final String headBadge;
    private final int headShift;
    /** Row whose head was just moved: its name comes next and gets headBadge. */
    private volatile UUID pendingHead;
    /** This player's own UUIDs: always badged, the API leaves our own session out of lookups. */
    private final Set<UUID> self;
    /** This player's own name, lowercased (null if unknown): always badged, like {@link #self}. */
    private final String selfName;
    private final Map<UUID, Long> checkedAt = new ConcurrentHashMap<>();
    private final Set<UUID> reality = ConcurrentHashMap.newKeySet();
    /** Rows waiting for a lookup: UUID -> lowercased name ("" when the row has no usable name). */
    private final Map<UUID, String> pending = new ConcurrentHashMap<>();
    private final Map<Class<?>, Method> idGetters = new ConcurrentHashMap<>();
    private final Map<Class<?>, Method> nameGetters = new ConcurrentHashMap<>();

    private volatile String apiUrl;
    private volatile String token;

    TabBadges(File sessionFile, String apiUrl, String badge, String headBadge, int headShift,
              Set<UUID> self, String selfName) {
        this.sessionFile = sessionFile;
        this.apiUrl = apiUrl;
        this.badge = badge;
        this.headBadge = headBadge == null || headBadge.isEmpty() || headShift <= 0 ? null : headBadge;
        this.headShift = this.headBadge == null ? 0 : headShift;
        this.self = self;
        this.selfName = normalizeName(selfName);
    }

    /** Lowercased Minecraft player name, or null when it isn't one (fake tab rows often aren't). */
    static String normalizeName(String name) {
        if (name == null) return null;
        String trimmed = name.trim();
        return NAME_PATTERN.matcher(trimmed).matches() ? trimmed.toLowerCase(Locale.ROOT) : null;
    }

    /**
     * Hooks.HEADSHIFT: called by the tab list right before it draws a row's head,
     * which happens just before that row's name is built.
     */
    Function<Object, Object> headShiftHook() {
        return profile -> {
            try {
                UUID id = profileId(profile);
                if (headShift > 0 && id != null && isReality(id, profileName(profile))) {
                    pendingHead = id;
                    return headShift;
                }
            } catch (Throwable ignored) {
                // Draw the head where the game wants it.
            }
            return 0;
        };
    }

    private boolean isReality(UUID id, String name) {
        return self.contains(id) || reality.contains(id) || (selfName != null && selfName.equals(name));
    }

    static Set<UUID> parseUuids(String list) {
        Set<UUID> out = new HashSet<>();
        if (list == null) return out;
        for (String part : list.split(",")) {
            try {
                if (!part.trim().isEmpty()) out.add(UUID.fromString(part.trim()));
            } catch (IllegalArgumentException ignored) {
                // Skip malformed entries.
            }
        }
        return out;
    }

    void start() {
        Thread worker = new Thread(this::run, "Reality-TabBadges");
        worker.setDaemon(true);
        worker.start();
    }

    @Override
    public Object apply(Object profile) {
        try {
            UUID id = profileId(profile);
            if (id == null) return "";
            String name = profileName(profile);
            if (!self.contains(id)) {
                Long at = checkedAt.get(id);
                if (at == null || System.currentTimeMillis() - at > CACHE_MS) {
                    pending.put(id, name == null ? "" : name);
                }
            }
            if (!isReality(id, name)) return "";
            if (id.equals(pendingHead)) {
                pendingHead = null;
                return headBadge;
            }
            return badge;
        } catch (Throwable t) {
            return "";
        }
    }

    /** authlib <= 6 exposes getId(); authlib 7 made GameProfile a record with id(). */
    private UUID profileId(Object profile) throws Exception {
        if (profile == null) return null;
        Method getter = idGetters.get(profile.getClass());
        if (getter == null) {
            try {
                getter = profile.getClass().getMethod("getId");
            } catch (NoSuchMethodException e) {
                getter = profile.getClass().getMethod("id");
            }
            idGetters.put(profile.getClass(), getter);
        }
        Object id = getter.invoke(profile);
        return id instanceof UUID ? (UUID) id : null;
    }

    /** Lowercased profile name, or null. authlib <= 6 has getName(); authlib 7 has name(). */
    private String profileName(Object profile) {
        if (profile == null) return null;
        try {
            Method getter = nameGetters.get(profile.getClass());
            if (getter == null) {
                try {
                    getter = profile.getClass().getMethod("getName");
                } catch (NoSuchMethodException e) {
                    getter = profile.getClass().getMethod("name");
                }
                nameGetters.put(profile.getClass(), getter);
            }
            Object name = getter.invoke(profile);
            return name instanceof String ? normalizeName((String) name) : null;
        } catch (Throwable t) {
            return null;
        }
    }

    private void run() {
        while (true) {
            try {
                Thread.sleep(POLL_MS);
                List<Row> batch = takeBatch();
                if (!batch.isEmpty()) lookup(batch);
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                // Network or token trouble: keep running, rows simply show no badge.
            }
        }
    }

    /** One tab row to look up. */
    static final class Row {
        final UUID id;
        /** Lowercased, or "" when the row has no usable name. */
        final String name;

        Row(UUID id, String name) {
            this.id = id;
            this.name = name == null ? "" : name;
        }
    }

    private List<Row> takeBatch() {
        List<Row> batch = new ArrayList<>();
        for (Map.Entry<UUID, String> e : pending.entrySet()) {
            if (batch.size() >= MAX_BATCH) break;
            batch.add(new Row(e.getKey(), e.getValue()));
        }
        for (Row row : batch) pending.remove(row.id);
        return batch;
    }

    private void requeue(List<Row> batch) {
        for (Row row : batch) pending.putIfAbsent(row.id, row.name);
    }

    private void lookup(List<Row> batch) throws Exception {
        if (token == null) reloadSession();
        if (token == null || apiUrl == null) {
            requeue(batch);
            return;
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl + "/presence/lookup").openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(5_000);
        conn.setReadTimeout(5_000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("X-Presence-Token", token);
        try (OutputStream out = conn.getOutputStream()) {
            out.write(requestBody(batch).getBytes(StandardCharsets.UTF_8));
        }

        int status = conn.getResponseCode();
        if (status == 401) {
            // Token rotated (presence session restarted) or expired: re-read it next round.
            token = null;
            requeue(batch);
            return;
        }
        if (status != 200) {
            requeue(batch);
            return;
        }

        String json = readAll(conn.getInputStream());
        Set<UUID> found = parseReality(json);
        Set<String> foundNames = parseRealityNames(json);
        long now = System.currentTimeMillis();
        for (Row row : batch) {
            // A row matches by UUID, or by name on servers that show another UUID
            // (offline mode behind a proxy, tab plugins that draw their own rows).
            if (found.contains(row.id) || (!row.name.isEmpty() && foundNames.contains(row.name))) reality.add(row.id);
            else reality.remove(row.id);
            checkedAt.put(row.id, now);
        }
    }

    private void reloadSession() {
        Properties props = readProperties(sessionFile);
        if (props == null) return;
        String url = props.getProperty("api.url");
        if (url != null && !url.isEmpty()) apiUrl = url;
        String t = props.getProperty("lookup.token");
        token = t == null || t.isEmpty() ? null : t;
    }

    static Properties readProperties(File file) {
        if (file == null || !file.isFile()) return null;
        try (InputStream in = new FileInputStream(file)) {
            Properties props = new Properties();
            props.load(in);
            return props;
        } catch (Exception e) {
            return null;
        }
    }

    /** {"uuids":[...],"names":[...]}; names are already checked against NAME_PATTERN, so no escaping is needed. */
    static String requestBody(List<Row> batch) {
        StringBuilder sb = new StringBuilder("{\"uuids\":[");
        for (int i = 0; i < batch.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(batch.get(i).id).append('"');
        }
        sb.append("],\"names\":[");
        boolean first = true;
        Set<String> seen = new HashSet<>();
        for (Row row : batch) {
            if (row.name.isEmpty() || !seen.add(row.name)) continue;
            if (!first) sb.append(',');
            sb.append('"').append(row.name).append('"');
            first = false;
        }
        return sb.append("]}").toString();
    }

    /** Pulls the names out of {"realityNames":[...]} (absent from older APIs). */
    static Set<String> parseRealityNames(String json) {
        Set<String> found = new HashSet<>();
        int key = json.indexOf("\"realityNames\"");
        if (key < 0) return found;
        int open = json.indexOf('[', key);
        int close = open < 0 ? -1 : json.indexOf(']', open);
        if (open < 0 || close < 0) return found;
        Matcher m = Pattern.compile("\"([A-Za-z0-9_]{1,16})\"").matcher(json.substring(open, close));
        while (m.find()) found.add(m.group(1).toLowerCase(Locale.ROOT));
        return found;
    }

    /** Pulls the UUIDs out of {"ok":true,"reality":[...]}. */
    static Set<UUID> parseReality(String json) {
        Set<UUID> found = new HashSet<>();
        int key = json.indexOf("\"reality\"");
        if (key < 0) return found;
        int open = json.indexOf('[', key);
        int close = json.indexOf(']', open);
        if (open < 0 || close < 0) return found;
        Matcher m = UUID_PATTERN.matcher(json.substring(open, close).toLowerCase());
        while (m.find()) found.add(UUID.fromString(m.group()));
        return found;
    }

    private static String readAll(InputStream in) throws Exception {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = stream.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
