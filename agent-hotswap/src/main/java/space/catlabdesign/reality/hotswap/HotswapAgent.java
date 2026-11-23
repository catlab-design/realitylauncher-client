package space.catlabdesign.reality.hotswap;

import java.lang.instrument.Instrumentation;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Experimental live hotswap, tier 0 only: copies staged resource/config files
 * into place and reloads resources when the launcher writes apply.json.
 * Does nothing unless the launcher passed all three system properties.
 */
public final class HotswapAgent {
    private HotswapAgent() {}

    public static void premain(String args, Instrumentation inst) {
        try {
            String session = System.getProperty("reality.hotswap");
            String tiers = System.getProperty("reality.hotswap.tiers");
            String namesPath = System.getProperty("reality.hotswap.names");
            if (session == null || tiers == null || namesPath == null) return;
            Names names = Names.load(Paths.get(namesPath));
            if (names == null) {
                System.err.println("[RealityHotswap] names file unusable; hotswap off");
                return;
            }
            Path sessionDir = Paths.get(session).toAbsolutePath().normalize();
            // <instance>/.reality/hotswap/<session-id>
            Path instanceDir = sessionDir.getParent().getParent().getParent();
            Applier applier = new Applier(new Channel(sessionDir), instanceDir, GameAccess.reflective(names, inst));
            Thread t = new Thread(() -> {
                while (true) {
                    applier.poll();
                    try {
                        Thread.sleep(1000);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }, "Reality-Hotswap");
            t.setDaemon(true);
            t.start();
        } catch (Throwable t) {
            System.err.println("[RealityHotswap] off: " + t);
        }
    }
}
