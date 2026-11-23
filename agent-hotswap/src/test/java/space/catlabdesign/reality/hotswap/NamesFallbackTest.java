package space.catlabdesign.reality.hotswap;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class NamesFallbackTest {
    @TempDir Path root;

    /** Stand-in for Minecraft: members under two name sets, only some present. */
    public static final class FakeMc {
        public static int reloads;
        public Object level;
        public static FakeMc getInstance() { return new FakeMc(); }
        public Object getConnection() { return null; }
        public java.util.concurrent.CompletableFuture<Void> reloadResourcePacks() {
            reloads++;
            return java.util.concurrent.CompletableFuture.completedFuture(null);
        }
        public static FakeMc m_91087_() { return new FakeMc(); }
        public Object m_91403_() { return null; }
        public java.util.concurrent.CompletableFuture<Void> m_91391_() {
            reloads += 10;
            return java.util.concurrent.CompletableFuture.completedFuture(null);
        }
        public Object f_91073_;
    }

    static final String CLS = FakeMc.class.getName();
    static final String OFFICIAL = "minecraft_class=" + CLS
        + "\nget_instance=getInstance\nget_connection=getConnection\nlevel_field=level\nreload_resource_packs=reloadResourcePacks\n";
    static final String SRG = "minecraft_class=" + CLS
        + "\nget_instance=m_91087_\nget_connection=m_91403_\nlevel_field=f_91073_\nreload_resource_packs=m_91391_\n";
    static final String MISSING = "minecraft_class=" + CLS
        + "\nget_instance=nope1\nget_connection=nope2\nlevel_field=nope3\nreload_resource_packs=nope4\n";

    static String alt(String set) {
        return set.replaceAll("(?m)^", "alt.");
    }

    GameAccess load(String text) throws Exception {
        Path p = root.resolve("names.properties");
        Files.write(p, text.getBytes(StandardCharsets.UTF_8));
        Names n = Names.load(p);
        assertNotNull(n);
        return GameAccess.reflective(n, null);
    }

    @Test
    void primary_wins_when_it_resolves() throws Exception {
        FakeMc.reloads = 0;
        GameAccess g = load(OFFICIAL + alt(SRG));
        assertTrue(g.available());
        g.reloadResources();
        assertEquals(1, FakeMc.reloads);
    }

    @Test
    void alt_wins_when_primary_fails() throws Exception {
        FakeMc.reloads = 0;
        GameAccess g = load(MISSING + alt(SRG));
        assertTrue(g.available());
        g.reloadResources();
        assertEquals(10, FakeMc.reloads);
    }

    @Test
    void a_partly_matching_primary_does_not_win() throws Exception {
        FakeMc.reloads = 0;
        String partial = OFFICIAL.replace("level_field=level", "level_field=nope");
        GameAccess g = load(partial + alt(SRG));
        assertTrue(g.available());
        g.reloadResources();
        assertEquals(10, FakeMc.reloads);
    }

    @Test
    void neither_resolves_stays_inert() throws Exception {
        GameAccess g = load(MISSING + alt(MISSING));
        assertFalse(g.available());
        assertFalse(g.atMainMenu());
        assertFalse(load(MISSING).available());
    }

    @Test
    void incomplete_alt_is_ignored() throws Exception {
        Path p = root.resolve("n2.properties");
        Files.write(p, (OFFICIAL + "alt.minecraft_class=x\n").getBytes(StandardCharsets.UTF_8));
        assertNull(Names.load(p).alt);
    }
}
