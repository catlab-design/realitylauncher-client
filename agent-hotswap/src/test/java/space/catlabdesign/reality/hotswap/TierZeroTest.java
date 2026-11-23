package space.catlabdesign.reality.hotswap;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TierZeroTest {
    @TempDir Path root;

    static final class Fake implements GameAccess {
        boolean menu = true;
        boolean available = true;
        public boolean available() { return available; }
        int reloads;
        RuntimeException reloadThrows;
        CompletableFuture<Object> reload = CompletableFuture.completedFuture(null);
        public boolean atMainMenu() { return menu; }
        public void onRenderThread(Runnable r) { r.run(); }
        public CompletableFuture<?> reloadResources() {
            reloads++;
            if (reloadThrows != null) throw reloadThrows;
            return reload;
        }
    }

    static Channel.Change ch(String path, int tier, String action) {
        Channel.Change c = new Channel.Change();
        c.path = path; c.tier = tier; c.action = action;
        return c;
    }

    static void put(Path p, String s) throws Exception {
        Files.createDirectories(p.getParent());
        Files.write(p, s.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void tier_zero_copies_only_tier_zero_files() throws Exception {
        Path inst = root.resolve("inst"), staging = root.resolve("inst/.reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        put(staging.resolve("resourcepacks/p.zip"), "zip");
        put(staging.resolve("mods/m.jar"), "jar");
        put(inst.resolve("config/a.toml"), "old");
        Fake g = new Fake();
        List<Channel.Change> changes = Arrays.asList(
            ch("config/a.toml", 0, "update"), ch("resourcepacks/p.zip", 0, "add"), ch("mods/m.jar", 3, "update"));
        TierZero.Outcome out = TierZero.apply(inst, staging, changes, g);
        assertEquals("new", new String(Files.readAllBytes(inst.resolve("config/a.toml")), StandardCharsets.UTF_8));
        assertTrue(Files.exists(inst.resolve("resourcepacks/p.zip")));
        assertFalse(Files.exists(inst.resolve("mods/m.jar")));
        assertEquals(Arrays.asList("config/a.toml", "resourcepacks/p.zip"), out.applied);
        assertEquals(Arrays.asList("mods/m.jar"), out.restart);
        assertEquals(1, g.reloads);
    }

    @Test
    void tier_zero_rejects_path_escape_and_removes() throws Exception {
        Path inst = root.resolve("inst"), staging = root.resolve("inst/.reality/staging/7");
        put(staging.resolve("config/x.toml"), "x");
        put(inst.resolve("config/gone.toml"), "g");
        put(root.resolve("outside.txt"), "o");
        Fake g = new Fake();
        TierZero.Outcome out = TierZero.apply(inst, staging, Arrays.asList(
            ch("../../outside.txt", 0, "update"), ch("config/gone.toml", 0, "remove")), g);
        assertEquals("o", new String(Files.readAllBytes(root.resolve("outside.txt")), StandardCharsets.UTF_8));
        assertFalse(Files.exists(inst.resolve("config/gone.toml")));
        assertEquals(Arrays.asList("config/gone.toml"), out.applied);
        assertEquals(Arrays.asList("../../outside.txt"), out.restart);
    }

    @Test
    void non_menu_yields_busy_in_world() throws Exception {
        Path sess = root.resolve("sess"), inst = root.resolve("inst"), staging = inst.resolve(".reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        Channel c = new Channel(sess);
        Fake g = new Fake();
        g.menu = false;
        Applier a = new Applier(c, inst, g);
        H.offer(c, 7, false, staging.toString(), "config/a.toml", 0);
        H.apply(c, 7);
        a.poll();
        assertFalse(Files.exists(inst.resolve("config/a.toml")));
        assertEquals(0, g.reloads);
        assertEquals("busy-in-world", H.status(c));
        // Back at the menu the same apply goes through.
        g.menu = true;
        a.poll();
        assertEquals("new", new String(Files.readAllBytes(inst.resolve("config/a.toml")), StandardCharsets.UTF_8));
        assertEquals("applied", H.outcome(c));
    }

    @Test
    void exception_reports_failed() throws Exception {
        Path sess = root.resolve("sess"), inst = root.resolve("inst"), staging = inst.resolve(".reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        Channel c = new Channel(sess);
        Fake g = new Fake();
        g.reloadThrows = new IllegalStateException("boom");
        Applier a = new Applier(c, inst, g);
        H.offer(c, 7, false, staging.toString(), "config/a.toml", 0);
        H.apply(c, 7);
        a.poll();
        assertEquals("failed", H.outcome(c));
        assertTrue(H.error(c).contains("boom"));
    }

    @Test
    void unresolved_game_stays_idle_and_refuses_apply() throws Exception {
        Path sess = root.resolve("sess"), inst = root.resolve("inst"), staging = inst.resolve(".reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        Channel c = new Channel(sess);
        Fake g = new Fake();
        g.available = false;
        Applier a = new Applier(c, inst, g);
        H.offer(c, 7, false, staging.toString(), "config/a.toml", 0);
        a.poll();
        assertEquals("idle", H.status(c));
        H.apply(c, 7);
        a.poll();
        assertEquals("refused", H.outcome(c));
        assertEquals("idle", H.status(c));
        assertEquals(0, g.reloads);
        assertFalse(Files.exists(inst.resolve("config/a.toml")));
    }

    @Test
    void stale_version_and_revoked_are_refused() throws Exception {
        Path sess = root.resolve("sess"), inst = root.resolve("inst"), staging = inst.resolve(".reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        Channel c = new Channel(sess);
        Fake g = new Fake();
        Applier a = new Applier(c, inst, g);
        H.offer(c, 7, false, staging.toString(), "config/a.toml", 0);
        H.apply(c, 6);
        a.poll();
        assertEquals("refused", H.outcome(c));
        H.offer(c, 7, true, staging.toString(), "config/a.toml", 0);
        H.apply(c, 7);
        a.poll();
        assertEquals("refused", H.outcome(c));
        assertEquals(0, g.reloads);
        assertFalse(Files.exists(inst.resolve("config/a.toml")));
    }

    @Test
    void healthy_after_reload_survives_grace() throws Exception {
        Path sess = root.resolve("sess"), inst = root.resolve("inst"), staging = inst.resolve(".reality/staging/7");
        put(staging.resolve("config/a.toml"), "new");
        Channel c = new Channel(sess);
        Fake g = new Fake();
        long[] now = {0};
        Applier a = new Applier(c, inst, g);
        a.clock = () -> now[0];
        H.offer(c, 7, false, staging.toString(), "config/a.toml", 0);
        H.apply(c, 7);
        a.poll();
        assertEquals("applied", H.outcome(c));
        now[0] = 9_000; a.poll();
        assertEquals("applied", H.outcome(c));
        now[0] = 10_001; a.poll();
        assertEquals("healthy", H.outcome(c));
    }

    @Test
    void names_parse_and_missing_keys_fail() throws Exception {
        Path p = root.resolve("names.properties");
        put(p, "minecraft_class=a.b.C\nget_instance=m1\nget_connection=m2\nlevel_field=f\nreload_resource_packs=r\n");
        Names n = Names.load(p);
        assertEquals("a.b.C", n.minecraftClass);
        assertEquals("r", n.reloadResourcePacks);
        put(p, "minecraft_class=a.b.C\n");
        assertNull(Names.load(p));
        assertNull(Names.load(root.resolve("nope")));
    }
}
