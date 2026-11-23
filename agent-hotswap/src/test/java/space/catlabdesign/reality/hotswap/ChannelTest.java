package space.catlabdesign.reality.hotswap;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ChannelTest {
    @TempDir Path dir;

    @Test
    void channel_reads_apply_and_ignores_unknown_fields() throws Exception {
        Files.write(dir.resolve("apply.json"),
            "{\"schema\":1,\"version\":3,\"future\":{\"x\":[1,2,{\"y\":\"}\"}]},\"s\":\"a\\\"b\"}".getBytes(StandardCharsets.UTF_8));
        Channel.Apply a = new Channel(dir).readApply();
        assertNotNull(a);
        assertEquals(3L, a.version);

        Files.write(dir.resolve("offer.json"), ("{\"schema\":1,\"version\":7,\"revoked\":true,\"extra\":null,"
            + "\"staging\":\"/s/7\",\"changes\":[{\"path\":\"config/a.toml\",\"tier\":0,\"sha256\":\"ab\","
            + "\"action\":\"update\",\"new\":1},{\"path\":\"mods/b.jar\",\"tier\":3,\"action\":\"frobnicate\"}]}")
            .getBytes(StandardCharsets.UTF_8));
        Channel.Offer o = new Channel(dir).readOffer();
        assertEquals(7L, o.version);
        assertTrue(o.revoked);
        assertEquals("/s/7", o.staging);
        assertEquals(2, o.changes.size());
        assertEquals("config/a.toml", o.changes.get(0).path);
        assertEquals(0, o.changes.get(0).tier);
        assertEquals("update", o.changes.get(0).action);
        assertEquals("mods/b.jar", o.changes.get(1).path);
        assertEquals(3, o.changes.get(1).tier);

        Files.write(dir.resolve("apply.json"), "{not json".getBytes(StandardCharsets.UTF_8));
        assertNull(new Channel(dir).readApply());
        Files.delete(dir.resolve("apply.json"));
        assertNull(new Channel(dir).readApply());
    }

    @Test
    void json_round_trips_strings_and_escapes() {
        String s = "line\n\"q\" \\ \u00e9 \u0001 \ud83d\ude00";
        String text = Json.write(Collections.<String, Object>singletonMap("k", s));
        assertEquals(s, ((java.util.Map<?, ?>) Json.parse(text)).get("k"));
        assertEquals("a", ((java.util.Map<?, ?>) Json.parse("{\"k\":\"\\u0061\"}")).get("k"));
    }

    @Test
    void channel_write_is_atomic() throws Exception {
        Channel ch = new Channel(dir);
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 20000; i++) big.append("p").append(i).append(',');
        AtomicBoolean stop = new AtomicBoolean();
        AtomicBoolean torn = new AtomicBoolean();
        ch.writeStatus("idle", 1L);
        Thread reader = new Thread(() -> {
            while (!stop.get()) {
                try {
                    byte[] b = Files.readAllBytes(dir.resolve("status.json"));
                    Json.parse(new String(b, StandardCharsets.UTF_8));
                } catch (java.nio.file.NoSuchFileException e) {
                    torn.set(true);
                } catch (Exception e) {
                    torn.set(true);
                }
            }
        });
        reader.start();
        for (int i = 0; i < 300; i++) {
            ch.writeResult(i, "applied", Arrays.asList(big.toString()), Collections.<String>emptyList(), null);
            ch.writeStatus(i % 2 == 0 ? "ready" : "applying", (long) i);
        }
        stop.set(true);
        reader.join();
        assertFalse(torn.get(), "reader saw a missing or partial file");
        try (java.util.stream.Stream<Path> s = Files.list(dir)) {
            assertEquals(0, s.filter(p -> p.getFileName().toString().endsWith(".tmp")).count());
        }
        java.util.Map<?, ?> st = (java.util.Map<?, ?>) Json.parse(
            new String(Files.readAllBytes(dir.resolve("status.json")), StandardCharsets.UTF_8));
        assertEquals(1.0, ((Number) st.get("schema")).doubleValue());
        assertEquals("applying", st.get("state"));
    }
}
