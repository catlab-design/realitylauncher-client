package space.catlabdesign.reality.hotswap;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * What the agent needs from the running game. The real implementation resolves
 * members reflectively from the names the launcher wrote, so nothing here is
 * tied to one mapping; Minecraft implements Executor, which gives the render
 * thread without any game-specific name.
 */
interface GameAccess {
    /** True only when the game is running at the title screen (no connection, no level). */
    boolean atMainMenu();

    /** Runs the task on the game's main (render) thread. */
    void onRenderThread(Runnable task);

    /** False while the game's members could not be found under any known name set: hotswap stays inert. */
    default boolean available() { return true; }

    /** Starts a resource reload; call on the render thread. */
    CompletableFuture<?> reloadResources();

    static GameAccess reflective(Names names, Instrumentation inst) {
        return new Reflective(names, inst);
    }

    final class Reflective implements GameAccess {
        private final Names names;
        private final Instrumentation inst;
        private Class<?> minecraft;
        private Method getInstance;
        private Method getConnection;
        private Field level;
        private Method reload;

        Reflective(Names names, Instrumentation inst) {
            this.names = names;
            this.inst = inst;
        }

        @Override
        public boolean available() {
            return resolve();
        }

        /** The primary names win when they fully resolve, else the alternative set. */
        private synchronized boolean resolve() {
            if (reload != null) return true;
            return resolveWith(names) || (names.alt != null && resolveWith(names.alt));
        }

        private boolean resolveWith(Names n) {
            try {
                Class<?> c = findClass(n);
                if (c == null) return false;
                Method gi = find(c, n.getInstance, true);
                Method gc = find(c, n.getConnection, false);
                Method rl = find(c, n.reloadResourcePacks, false);
                Field lf = null;
                for (Class<?> k = c; k != null && lf == null; k = k.getSuperclass()) {
                    try { lf = k.getDeclaredField(n.levelField); } catch (NoSuchFieldException ignored) { }
                }
                if (gi == null || gc == null || rl == null || lf == null) return false;
                gi.setAccessible(true); gc.setAccessible(true); rl.setAccessible(true); lf.setAccessible(true);
                minecraft = c; getInstance = gi; getConnection = gc; level = lf; reload = rl;
                return true;
            } catch (Throwable t) {
                return false;
            }
        }

        private Class<?> findClass(Names names) {
            if (inst != null) {
                for (Class<?> c : inst.getAllLoadedClasses()) {
                    if (c.getName().equals(names.minecraftClass)) return c;
                }
            }
            ClassLoader[] loaders = {Thread.currentThread().getContextClassLoader(), ClassLoader.getSystemClassLoader()};
            for (ClassLoader l : loaders) {
                if (l == null) continue;
                try { return Class.forName(names.minecraftClass, false, l); } catch (Throwable ignored) { }
            }
            return null;
        }

        private static Method find(Class<?> c, String name, boolean wantStatic) {
            for (Class<?> k = c; k != null; k = k.getSuperclass()) {
                for (Method m : k.getDeclaredMethods()) {
                    if (m.getName().equals(name) && m.getParameterTypes().length == 0
                            && Modifier.isStatic(m.getModifiers()) == wantStatic) return m;
                }
            }
            return null;
        }

        private Object instance() throws Exception {
            return resolve() ? getInstance.invoke(null) : null;
        }

        @Override
        public boolean atMainMenu() {
            try {
                Object mc = instance();
                if (mc == null) return false;
                return getConnection.invoke(mc) == null && level.get(mc) == null;
            } catch (Throwable t) {
                return false;
            }
        }

        @Override
        public void onRenderThread(Runnable task) {
            try {
                Object mc = instance();
                if (!(mc instanceof Executor)) throw new IllegalStateException("Minecraft is not an Executor");
                ((Executor) mc).execute(task);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        @Override
        public CompletableFuture<?> reloadResources() {
            try {
                Object mc = instance();
                if (mc == null) throw new IllegalStateException("no Minecraft instance");
                Object r = reload.invoke(mc);
                if (r instanceof CompletableFuture) return (CompletableFuture<?>) r;
                throw new IllegalStateException("reload did not return a CompletableFuture");
            } catch (java.lang.reflect.InvocationTargetException e) {
                Throwable c = e.getCause() == null ? e : e.getCause();
                throw new IllegalStateException(String.valueOf(c), c);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
