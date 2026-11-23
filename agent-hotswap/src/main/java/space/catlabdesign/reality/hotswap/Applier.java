package space.catlabdesign.reality.hotswap;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.LongSupplier;

/**
 * One poll step of the hotswap thread: keeps status.json current, answers an
 * Apply click (refusing stale or revoked ones), and promotes a clean reload to
 * "healthy" after a grace period.
 */
final class Applier {
    static final long HEALTHY_AFTER_MS = 10_000;

    private final Channel channel;
    private final Path instanceDir;
    private final GameAccess game;
    LongSupplier clock = System::currentTimeMillis;

    private String lastStatus;
    private String handledKey;
    // Reload in flight, waiting to be judged healthy or failed.
    private TierZero.Outcome pending;
    private long pendingVersion;
    private long doneAt = -1;

    Applier(Channel channel, Path instanceDir, GameAccess game) {
        this.channel = channel;
        this.instanceDir = instanceDir;
        this.game = game;
    }

    /** Never throws; a failure is reported through the channel when it can be. */
    void poll() {
        try {
            step();
        } catch (Throwable t) {
            System.err.println("[RealityHotswap] " + t);
        }
    }

    private void step() throws Exception {
        Channel.Offer offer = channel.readOffer();
        Channel.Apply apply = channel.readApply();
        boolean live = offer != null && !offer.revoked;
        Long version = offer == null ? null : Long.valueOf(offer.version);

        checkHealth();

        if (apply != null) {
            String key = apply.version + ":" + Files.getLastModifiedTime(channel.dir().resolve("apply.json")).toMillis();
            if (!key.equals(handledKey)) {
                if (offer == null || offer.revoked || offer.version != apply.version) {
                    handledKey = key;
                    channel.writeResult(apply.version, "refused", Collections.<String>emptyList(),
                        Collections.<String>emptyList(), offer == null ? "no offer" : offer.revoked ? "offer revoked"
                            : "stale version");
                } else if (!game.atMainMenu()) {
                    setStatus("busy-in-world", version);
                    return; // try again once the player is back at the menu
                } else {
                    handledKey = key;
                    setStatus("applying", version);
                    run(offer);
                    setStatus("idle", version);
                    return;
                }
            }
        }
        if (pending != null) return; // keep the result's version in status until judged
        setStatus(live && !isDone(offer.version) ? "ready" : "idle", version);
    }

    private long appliedVersion = -1;

    private boolean isDone(long v) { return v == appliedVersion; }

    private void run(Channel.Offer offer) throws Exception {
        pending = null;
        doneAt = -1;
        try {
            Path staging = Paths.get(offer.staging).toAbsolutePath().normalize();
            Path allowed = instanceDir.toAbsolutePath().normalize().resolve(".reality/staging");
            if (!staging.startsWith(allowed)) throw new IllegalStateException("staging outside the instance");
            TierZero.Outcome out = TierZero.apply(instanceDir, staging, offer.changes, game);
            appliedVersion = offer.version;
            channel.writeResult(offer.version, "applied", out.applied, out.restart, null);
            if (out.reload != null) {
                pending = out;
                pendingVersion = offer.version;
                checkHealth();
            }
        } catch (Throwable t) {
            channel.writeResult(offer.version, "failed", Collections.<String>emptyList(),
                Collections.<String>emptyList(), String.valueOf(t.getMessage() == null ? t : t.getMessage()));
        }
    }

    private void checkHealth() throws Exception {
        if (pending == null) return;
        java.util.concurrent.CompletableFuture<?> f = pending.reload;
        if (!f.isDone()) return;
        if (f.isCompletedExceptionally()) {
            String msg;
            try { f.get(); msg = "reload failed"; } catch (Throwable t) {
                Throwable c = t.getCause() == null ? t : t.getCause();
                msg = "resource reload failed: " + c;
            }
            channel.writeResult(pendingVersion, "failed", new ArrayList<>(pending.applied),
                new ArrayList<>(pending.restart), msg);
            pending = null;
            return;
        }
        long now = clock.getAsLong();
        if (doneAt < 0) doneAt = now;
        if (now - doneAt > HEALTHY_AFTER_MS) {
            channel.writeResult(pendingVersion, "healthy", new ArrayList<>(pending.applied),
                new ArrayList<>(pending.restart), null);
            pending = null;
        }
    }

    private void setStatus(String state, Long version) throws Exception {
        String key = state + ":" + version;
        if (key.equals(lastStatus)) return;
        channel.writeStatus(state, version);
        lastStatus = key;
    }
}
