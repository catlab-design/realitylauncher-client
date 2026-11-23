package space.catlabdesign.reality.hotswap;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/** Tier 0: files the game re-reads on a resource reload. Copy them, then reload. */
final class TierZero {
    private TierZero() {}

    static final class Outcome {
        final List<String> applied = new ArrayList<>();
        final List<String> restart = new ArrayList<>();
        /** The resource reload, or null when nothing needed one. */
        CompletableFuture<?> reload;
    }

    /**
     * Copies each tier-0 add/update from {@code staging} into {@code instanceDir}
     * (temp + rename; staged sha256 checked first when given), deletes tier-0
     * removes, then reloads resources on the render thread. Everything else is
     * reported in {@code restart}. Throws on any failure; nothing is copied if a
     * staged file is missing or fails its checksum.
     */
    static Outcome apply(Path instanceDir, Path staging, List<Channel.Change> changes, GameAccess game)
            throws Exception {
        Path root = instanceDir.toAbsolutePath().normalize();
        Path stage = staging.toAbsolutePath().normalize();
        Outcome out = new Outcome();
        List<Channel.Change> todo = new ArrayList<>();
        for (Channel.Change c : changes) {
            if (c.tier == 0 && inside(root, c.path) != null && ("add".equals(c.action) || "update".equals(c.action)
                    || "remove".equals(c.action)) && (c.action.equals("remove") || inside(stage, c.path) != null)) {
                todo.add(c);
            } else {
                out.restart.add(c.path);
            }
        }
        // Verify first so a bad file leaves the instance untouched.
        for (Channel.Change c : todo) {
            if ("remove".equals(c.action)) continue;
            Path src = inside(stage, c.path);
            if (!Files.isRegularFile(src)) throw new IOException("staged file missing: " + c.path);
            if (c.sha256 != null && !c.sha256.isEmpty() && !c.sha256.equalsIgnoreCase(sha256(src))) {
                throw new IOException("staged file changed: " + c.path);
            }
        }
        for (Channel.Change c : todo) {
            Path dest = inside(root, c.path);
            if ("remove".equals(c.action)) {
                Files.deleteIfExists(dest);
            } else {
                copyAtomic(inside(stage, c.path), dest);
            }
            out.applied.add(c.path);
        }
        if (!out.applied.isEmpty()) out.reload = reload(game);
        return out;
    }

    /** Resolves a relative path under base; null when absolute or it escapes base. */
    static Path inside(Path base, String rel) {
        if (rel == null || rel.isEmpty()) return null;
        try {
            Path p = base.resolve(rel).normalize();
            return p.startsWith(base) && !p.equals(base) && !java.nio.file.Paths.get(rel).isAbsolute() ? p : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static CompletableFuture<?> reload(GameAccess game) throws Exception {
        CompletableFuture<CompletableFuture<?>> started = new CompletableFuture<>();
        game.onRenderThread(() -> {
            try {
                started.complete(game.reloadResources());
            } catch (Throwable t) {
                started.completeExceptionally(t);
            }
        });
        try {
            return started.get(30, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof Exception) throw (Exception) c;
            throw e;
        }
    }

    private static void copyAtomic(Path src, Path dest) throws IOException {
        Files.createDirectories(dest.getParent());
        Path tmp = dest.resolveSibling("." + dest.getFileName() + ".reality-tmp");
        try {
            Files.copy(src, tmp, StandardCopyOption.REPLACE_EXISTING);
            try {
                Files.move(tmp, dest, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, dest, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    static String sha256(Path p) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(p)) {
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
        }
        StringBuilder b = new StringBuilder();
        for (byte x : md.digest()) b.append(String.format("%02x", x));
        return b.toString();
    }
}
