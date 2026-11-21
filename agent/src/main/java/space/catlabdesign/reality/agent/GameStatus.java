package space.catlabdesign.reality.agent;

import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Collection;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

/**
 * Tells the launcher where the player is, for Discord Rich Presence: main menu,
 * a singleplayer world, or a server and how many players its tab list holds.
 * Written to a properties file (state=menu|singleplayer|server, players=N)
 * whenever it changes; the file is absent until the game has started.
 *
 * Needs no names of its own. The tab-list class the launcher already resolves
 * (TabScheme.overlayClass) gives them away:
 *   PlayerTabOverlay(Minecraft, Gui)                          -> Minecraft class
 *   this.minecraft.player.connection.getListedOnlinePlayers() -> packet listener
 *                                                                class + method
 * Minecraft.getInstance() and getConnection() are then found by signature.
 * A null connection means no world is loaded; the integrated server's
 * "Server thread" tells a singleplayer world from a server.
 */
final class GameStatus {
    static final long POLL_MS = 2_000;
    private static final String COLLECTION_DESC = "()Ljava/util/Collection;";
    private static final String SERVER_THREAD = "Server thread";

    private final File file;
    private volatile Target target;
    private Resolved resolved;
    private boolean failed;
    private String written;

    private static final class Target {
        final ClassLoader loader;
        final String minecraft;
        final String listener;
        final String players;

        Target(ClassLoader loader, String minecraft, String listener, String players) {
            this.loader = loader;
            this.minecraft = minecraft;
            this.listener = listener;
            this.players = players;
        }
    }

    private static final class Resolved {
        final Method getInstance;
        final Method getConnection;
        final Method players;

        Resolved(Method getInstance, Method getConnection, Method players) {
            this.getInstance = getInstance;
            this.getConnection = getConnection;
            this.players = players;
        }
    }

    GameStatus(File file) {
        this.file = file;
    }

    void start() {
        Thread worker = new Thread(this::run, "Reality-GameStatus");
        worker.setDaemon(true);
        worker.start();
    }

    /** Reads the names off the unpatched tab-list class. Never throws. */
    void observe(ClassLoader loader, byte[] overlayBytes) {
        if (target != null) return;
        try {
            ClassNode cls = new ClassNode();
            new ClassReader(overlayBytes).accept(cls, ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
            String minecraft = null;
            String listener = null;
            String players = null;
            for (MethodNode m : cls.methods) {
                if (minecraft == null && m.name.equals("<init>")) {
                    Type[] args = Type.getArgumentTypes(m.desc);
                    if (args.length > 0 && args[0].getSort() == Type.OBJECT) minecraft = args[0].getInternalName();
                }
                for (AbstractInsnNode insn = m.instructions.getFirst(); insn != null && listener == null;
                     insn = insn.getNext()) {
                    if (insn.getOpcode() != Opcodes.INVOKEVIRTUAL) continue;
                    MethodInsnNode call = (MethodInsnNode) insn;
                    if (!call.desc.equals(COLLECTION_DESC)) continue;
                    AbstractInsnNode prev = previousReal(call);
                    if (prev != null && prev.getOpcode() == Opcodes.GETFIELD
                            && ((FieldInsnNode) prev).desc.equals("L" + call.owner + ";")) {
                        listener = call.owner;
                        players = call.name;
                    }
                }
            }
            if (minecraft == null || listener == null) {
                System.err.println("[RealityAgent] Game status off: tab list shape not recognised");
                return;
            }
            target = new Target(loader, minecraft, listener, players);
        } catch (Throwable t) {
            System.err.println("[RealityAgent] Game status off: " + t);
        }
    }

    private static AbstractInsnNode previousReal(AbstractInsnNode insn) {
        AbstractInsnNode p = insn.getPrevious();
        while (p != null && p.getOpcode() < 0) p = p.getPrevious();
        return p;
    }

    private void run() {
        while (true) {
            try {
                Thread.sleep(POLL_MS);
                String status = current();
                if (status != null && !status.equals(written)) {
                    write(status);
                    written = status;
                }
            } catch (InterruptedException e) {
                return;
            } catch (Throwable t) {
                // Mid-switch between worlds or a write hiccup: try again next round.
            }
        }
    }

    private String current() throws Exception {
        Target t = target;
        if (t == null || failed) return null;
        if (resolved == null) {
            try {
                resolved = resolve(t);
            } catch (Throwable e) {
                failed = true;
                System.err.println("[RealityAgent] Game status off: " + e);
                return null;
            }
        }
        Object minecraft = resolved.getInstance.invoke(null);
        if (minecraft == null) return null;
        Object connection = resolved.getConnection.invoke(minecraft);
        if (connection == null) return "state=menu\n";
        int players = ((Collection<?>) resolved.players.invoke(connection)).size();
        String state = integratedServerRunning() ? "singleplayer" : "server";
        return "state=" + state + "\nplayers=" + players + "\n";
    }

    private static Resolved resolve(Target t) throws Exception {
        Class<?> minecraft = Class.forName(t.minecraft.replace('/', '.'), false, t.loader);
        Class<?> listener = Class.forName(t.listener.replace('/', '.'), false, t.loader);
        Method getInstance = null;
        Method getConnection = null;
        for (Method m : minecraft.getMethods()) {
            if (m.getParameterTypes().length != 0) continue;
            boolean isStatic = Modifier.isStatic(m.getModifiers());
            if (isStatic && m.getReturnType() == minecraft) getInstance = m;
            if (!isStatic && m.getReturnType() == listener) getConnection = m;
        }
        if (getInstance == null || getConnection == null) {
            throw new NoSuchMethodException(t.minecraft + " getInstance/getConnection");
        }
        return new Resolved(getInstance, getConnection, listener.getMethod(t.players));
    }

    private static boolean integratedServerRunning() {
        ThreadGroup root = Thread.currentThread().getThreadGroup();
        while (root.getParent() != null) root = root.getParent();
        Thread[] threads = new Thread[root.activeCount() + 16];
        int n = root.enumerate(threads, true);
        for (int i = 0; i < n; i++) {
            if (SERVER_THREAD.equals(threads[i].getName())) return true;
        }
        return false;
    }

    private void write(String status) throws Exception {
        File tmp = new File(file.getPath() + ".tmp");
        Files.write(tmp.toPath(), status.getBytes(StandardCharsets.UTF_8));
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
}
