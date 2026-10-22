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
public final class TabBadges implements Function<Object, String> {
    /** Read by the patched tab-list class; replaced in premain when badges are enabled. */
    public static Function<Object, String> INSTANCE = profile -> "";

    static final int MAX_BATCH = 100;
    static final long CACHE_MS = 60_000;
    static final long POLL_MS = 2_000;
    private static final Pattern UUID_PATTERN =
            Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private final File sessionFile;
    private final String badge;
    private final Map<UUID, Long> checkedAt = new ConcurrentHashMap<>();
    private final Set<UUID> reality = ConcurrentHashMap.newKeySet();
    private final Set<UUID> pending = ConcurrentHashMap.newKeySet();
    private final Map<Class<?>, Method> idGetters = new ConcurrentHashMap<>();

    private volatile String apiUrl;
    private volatile String token;

    TabBadges(File sessionFile, String apiUrl, String badge) {
        this.sessionFile = sessionFile;
        this.apiUrl = apiUrl;
        this.badge = badge;
    }

    void start() {
        Thread worker = new Thread(this::run, "Reality-TabBadges");
        worker.setDaemon(true);
        worker.start();
    }

    @Override
    public String apply(Object profile) {
        try {
            UUID id = profileId(profile);
            if (id == null) return "";
            Long at = checkedAt.get(id);
            if (at == null || System.currentTimeMillis() - at > CACHE_MS) pending.add(id);
            return reality.contains(id) ? badge : "";
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

    private void run() {
        while (true) {
            try {
                Thread.sleep(POLL_MS);
                List<UUID> batch = takeBatch();
                if (!batch.isEmpty()) lookup(batch);
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                // Network or token trouble: keep running, rows simply show no badge.
            }
        }
    }

    private List<UUID> takeBatch() {
        List<UUID> batch = new ArrayList<>();
        for (UUID id : pending) {
            if (batch.size() >= MAX_BATCH) break;
            batch.add(id);
        }
        pending.removeAll(batch);
        return batch;
    }

    private void lookup(List<UUID> batch) throws Exception {
        if (token == null) reloadSession();
        if (token == null || apiUrl == null) {
            pending.addAll(batch);
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
            pending.addAll(batch);
            return;
        }
        if (status != 200) {
            pending.addAll(batch);
            return;
        }

        Set<UUID> found = parseReality(readAll(conn.getInputStream()));
        long now = System.currentTimeMillis();
        for (UUID id : batch) {
            if (found.contains(id)) reality.add(id);
            else reality.remove(id);
            checkedAt.put(id, now);
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

    static String requestBody(List<UUID> batch) {
        StringBuilder sb = new StringBuilder("{\"uuids\":[");
        for (int i = 0; i < batch.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(batch.get(i)).append('"');
        }
        return sb.append("]}").toString();
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
