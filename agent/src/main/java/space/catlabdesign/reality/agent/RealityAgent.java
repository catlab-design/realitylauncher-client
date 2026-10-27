package space.catlabdesign.reality.agent;

import java.io.File;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/**
 * Brands the game for Reality Launcher. Only touches classes whose names are
 * never obfuscated (LWJGL, Forge/NeoForge BrandingControl), plus the tab list
 * through runtime names the launcher resolves, so one jar works for every
 * Minecraft version and loader.
 *
 * Injected code has no branches (no stack map frames to recompute) and only
 * references java.base: decisions live in {@link Hooks}, reached through a
 * static field that the patched class fills by reflection, so Forge's module
 * layers never have to read this jar.
 *
 * System properties set by the launcher:
 *   reality.title          window title replacing Minecraft's default one
 *   reality.mcversion      game version, to recognise the default title
 *   reality.icon           RLIC file with the window icon (see WindowHooks)
 *   reality.vanillaIcons   CRC32s of Minecraft's default icon images
 *   reality.brand          line added to the Forge/NeoForge title screen branding
 *   reality.session        properties file with the tab-badge lookup token, badge
 *                          strings and the runtime names of the tab-list members
 *                          (see TabScheme, TabBadges, HeadShiftPatch)
 *   reality.status         file the agent keeps the player's whereabouts in, for
 *                          the launcher's Discord presence (see GameStatus);
 *                          needs the tab-list names from reality.session
 */
public final class RealityAgent implements ClassFileTransformer {
    private static final String LWJGL3_GLFW = "org/lwjgl/glfw/GLFW";
    private static final String LWJGL2_DISPLAY = "org/lwjgl/opengl/Display";
    private static final String FUNCTION = "java/util/function/Function";
    private static final String[] BRANDING_CONTROLS = {
            "net/minecraftforge/internal/BrandingControl",
            "net/minecraftforge/fml/BrandingControl",
            "net/neoforged/neoforge/internal/BrandingControl",
            "net/neoforged/fml/BrandingControl",
    };

    private final boolean title;
    private final boolean icon;
    private final String brand;
    private final List<TabScheme> tabSchemes;
    private final GameStatus status;

    private RealityAgent(boolean title, boolean icon, String brand, List<TabScheme> tabSchemes,
                         GameStatus status) {
        this.title = title;
        this.icon = icon;
        this.brand = brand;
        this.tabSchemes = tabSchemes;
        this.status = status;
    }

    public static void premain(String args, Instrumentation inst) {
        boolean title = installTitle();
        boolean icon = installIcon();
        String brand = System.getProperty("reality.brand");
        List<TabScheme> tabSchemes = startTabBadges(System.getProperty("reality.session"));
        GameStatus status = startGameStatus(System.getProperty("reality.status"), tabSchemes);
        if (!title && !icon && isBlank(brand) && tabSchemes.isEmpty()) return;
        inst.addTransformer(new RealityAgent(title, icon, brand, tabSchemes, status));
    }

    private static GameStatus startGameStatus(String path, List<TabScheme> tabSchemes) {
        if (isBlank(path) || tabSchemes.isEmpty()) return null;
        GameStatus status = new GameStatus(new File(path));
        status.start();
        return status;
    }

    private static boolean installTitle() {
        String title = System.getProperty("reality.title");
        if (isBlank(title)) return false;
        Hooks.TITLE = WindowHooks.titleHook(title, System.getProperty("reality.mcversion"));
        return true;
    }

    private static boolean installIcon() {
        String path = System.getProperty("reality.icon");
        if (isBlank(path)) return false;
        try {
            Hooks.ICON = WindowHooks.iconHook(
                    WindowHooks.readIcons(new File(path)),
                    WindowHooks.parseFingerprints(System.getProperty("reality.vanillaIcons")));
            return true;
        } catch (Throwable t) {
            System.err.println("[RealityAgent] Window icon disabled: " + t);
            return false;
        }
    }

    private static List<TabScheme> startTabBadges(String sessionPath) {
        if (isBlank(sessionPath)) return Collections.emptyList();
        try {
            File file = new File(sessionPath);
            Properties props = TabBadges.readProperties(file);
            if (props == null) return Collections.emptyList();
            String badge = props.getProperty("badge");
            List<TabScheme> schemes = TabScheme.load(props);
            if (isBlank(badge) || schemes.isEmpty()) return Collections.emptyList();
            int headShift;
            try {
                headShift = Integer.parseInt(props.getProperty("badge.head.shift", "0").trim());
            } catch (NumberFormatException e) {
                headShift = 0;
            }
            TabBadges badges = new TabBadges(file, props.getProperty("api.url"), badge,
                    props.getProperty("badge.head"), headShift,
                    TabBadges.parseUuids(props.getProperty("self.uuids")));
            badges.start();
            Hooks.BADGE = badges;
            Hooks.HEADSHIFT = badges.headShiftHook();
            return schemes;
        } catch (Throwable t) {
            System.err.println("[RealityAgent] Tab badges disabled: " + t);
            return Collections.emptyList();
        }
    }

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> redefined,
                            ProtectionDomain domain, byte[] bytes) {
        if (className == null) return null;
        try {
            if (className.equals(LWJGL3_GLFW) && (title || icon)) {
                return rewrite(bytes, new GlfwPatch(className, title, icon));
            }
            if (className.equals(LWJGL2_DISPLAY) && title) {
                return rewrite(bytes, new DisplayPatch(className));
            }
            if (!isBlank(brand) && isBrandingControl(className)) {
                return rewrite(bytes, new BrandingPatch());
            }
            List<TabScheme> schemes = schemesFor(className);
            if (!schemes.isEmpty()) {
                if (status != null) status.observe(loader, bytes);
                TabPatch tab = new TabPatch(className, schemes);
                byte[] patched = rewrite(bytes, tab);
                if (patched == null) return null;
                byte[] withHead = HeadShiftPatch.apply(patched, className, tab.matched);
                return withHead != null ? withHead : patched;
            }
        } catch (Throwable t) {
            System.err.println("[RealityAgent] Skipping " + className + ": " + t);
        }
        return null;
    }

    private List<TabScheme> schemesFor(String className) {
        List<TabScheme> matches = new ArrayList<>();
        for (TabScheme scheme : tabSchemes) {
            if (scheme.overlayClass.equals(className)) matches.add(scheme);
        }
        return matches;
    }

    private static boolean isBrandingControl(String className) {
        for (String name : BRANDING_CONTROLS) {
            if (name.equals(className)) return true;
        }
        return false;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private interface Patch {
        ClassVisitor wrap(ClassVisitor next);
        boolean applied();
    }

    private static byte[] rewrite(byte[] bytes, Patch patch) {
        ClassReader reader = new ClassReader(bytes);
        ClassWriter writer = new ClassWriter(reader, 0);
        reader.accept(patch.wrap(writer), 0);
        return patch.applied() ? writer.toByteArray() : null;
    }

    /**
     * Adds one static Function field per hook (reality$title, ...) and fills it
     * at class init:
     * reality$x = (Function) Class.forName(Hooks, true, systemLoader).getField("X").get(null)
     * Subclasses patch methods in {@link #patchMethod}.
     */
    private abstract static class HookFields implements Patch {
        final String owner;
        private final String[] hooks;
        boolean applied;

        HookFields(String owner, String... hooks) {
            this.owner = owner;
            this.hooks = hooks;
        }

        @Override
        public boolean applied() {
            return applied;
        }

        abstract MethodVisitor patchMethod(int access, String name, String desc, MethodVisitor mv);

        static String field(String hook) {
            return "reality$" + hook.toLowerCase();
        }

        /** Pushes the hook's Function onto the stack. */
        void loadHook(MethodVisitor mv, String hook) {
            mv.visitFieldInsn(Opcodes.GETSTATIC, owner, field(hook), "L" + FUNCTION + ";");
        }

        @Override
        public ClassVisitor wrap(ClassVisitor next) {
            return new ClassVisitor(Opcodes.ASM9, next) {
                private boolean hasClinit;

                @Override
                public MethodVisitor visitMethod(int access, String name, String desc, String sig, String[] ex) {
                    MethodVisitor mv = super.visitMethod(access, name, desc, sig, ex);
                    if (name.equals("<clinit>")) {
                        hasClinit = true;
                        return new MethodVisitor(Opcodes.ASM9, mv) {
                            @Override
                            public void visitCode() {
                                super.visitCode();
                                emitFieldInits(mv);
                            }

                            @Override
                            public void visitMaxs(int maxStack, int maxLocals) {
                                super.visitMaxs(Math.max(maxStack, 3), maxLocals);
                            }
                        };
                    }
                    return patchMethod(access, name, desc, mv);
                }

                @Override
                public void visitEnd() {
                    if (applied) {
                        for (String hook : hooks) {
                            super.visitField(Opcodes.ACC_PRIVATE | Opcodes.ACC_STATIC | Opcodes.ACC_SYNTHETIC,
                                    field(hook), "L" + FUNCTION + ";", null, null).visitEnd();
                        }
                        if (!hasClinit) {
                            MethodVisitor mv = super.visitMethod(Opcodes.ACC_STATIC, "<clinit>", "()V", null, null);
                            mv.visitCode();
                            emitFieldInits(mv);
                            mv.visitInsn(Opcodes.RETURN);
                            mv.visitMaxs(3, 0);
                            mv.visitEnd();
                        }
                    }
                    super.visitEnd();
                }
            };
        }

        private void emitFieldInits(MethodVisitor mv) {
            for (String hook : hooks) {
                mv.visitLdcInsn(Hooks.class.getName());
                mv.visitInsn(Opcodes.ICONST_1);
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/ClassLoader", "getSystemClassLoader",
                        "()Ljava/lang/ClassLoader;", false);
                mv.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/Class", "forName",
                        "(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;", false);
                mv.visitLdcInsn(hook);
                mv.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/lang/Class", "getField",
                        "(Ljava/lang/String;)Ljava/lang/reflect/Field;", false);
                mv.visitInsn(Opcodes.ACONST_NULL);
                mv.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/lang/reflect/Field", "get",
                        "(Ljava/lang/Object;)Ljava/lang/Object;", false);
                mv.visitTypeInsn(Opcodes.CHECKCAST, FUNCTION);
                mv.visitFieldInsn(Opcodes.PUTSTATIC, owner, field(hook), "L" + FUNCTION + ";");
            }
        }

        /** On entry: arg[slot] = (castType) hook.apply(arg[slot]). */
        MethodVisitor filterArgOnEntry(MethodVisitor mv, String hook, int slot, String castType) {
            return new MethodVisitor(Opcodes.ASM9, mv) {
                @Override
                public void visitCode() {
                    super.visitCode();
                    loadHook(mv, hook);
                    super.visitVarInsn(Opcodes.ALOAD, slot);
                    super.visitMethodInsn(Opcodes.INVOKEINTERFACE, FUNCTION, "apply",
                            "(Ljava/lang/Object;)Ljava/lang/Object;", true);
                    super.visitTypeInsn(Opcodes.CHECKCAST, castType);
                    super.visitVarInsn(Opcodes.ASTORE, slot);
                }

                @Override
                public void visitMaxs(int maxStack, int maxLocals) {
                    super.visitMaxs(Math.max(maxStack, 2), maxLocals);
                }
            };
        }
    }

    /**
     * LWJGL3 GLFW: glfwCreateWindow / glfwSetWindowTitle titles go through
     * Hooks.TITLE (Forge's early loading window only passes its title to
     * glfwCreateWindow); glfwSetWindowIcon images go through Hooks.ICON.
     */
    private static final class GlfwPatch extends HookFields {
        private final boolean title;
        private final boolean icon;

        GlfwPatch(String owner, boolean title, boolean icon) {
            super(owner, "TITLE", "ICON");
            this.title = title;
            this.icon = icon;
        }

        @Override
        MethodVisitor patchMethod(int access, String name, String desc, MethodVisitor mv) {
            if ((access & Opcodes.ACC_STATIC) == 0) return mv;
            if (title && name.equals("glfwSetWindowTitle") && desc.equals("(JLjava/lang/CharSequence;)V")) {
                applied = true;
                return filterArgOnEntry(mv, "TITLE", 2, "java/lang/CharSequence");
            }
            if (title && name.equals("glfwCreateWindow") && desc.equals("(IILjava/lang/CharSequence;JJ)J")) {
                applied = true;
                return filterArgOnEntry(mv, "TITLE", 2, "java/lang/CharSequence");
            }
            if (icon && name.equals("glfwSetWindowIcon") && desc.equals("(JLorg/lwjgl/glfw/GLFWImage$Buffer;)V")) {
                applied = true;
                return filterArgOnEntry(mv, "ICON", 2, "org/lwjgl/glfw/GLFWImage$Buffer");
            }
            return mv;
        }
    }

    /** LWJGL2 Display.setTitle(String) (Minecraft before 1.13). */
    private static final class DisplayPatch extends HookFields {
        DisplayPatch(String owner) {
            super(owner, "TITLE");
        }

        @Override
        MethodVisitor patchMethod(int access, String name, String desc, MethodVisitor mv) {
            if ((access & Opcodes.ACC_STATIC) == 0 || !name.equals("setTitle")
                    || !desc.equals("(Ljava/lang/String;)V")) {
                return mv;
            }
            applied = true;
            return filterArgOnEntry(mv, "TITLE", 0, "java/lang/String");
        }
    }

    /**
     * PlayerTabOverlay.getNameForDisplay(PlayerInfo): prefix the returned name with
     * Hooks.BADGE for Reality players. Several schemes can share the class name
     * (Forge official vs SRG members); the one whose method matches wins.
     */
    private static final class TabPatch extends HookFields {
        private final List<TabScheme> schemes;

        /** The scheme whose getNameForDisplay matched, for HeadShiftPatch. */
        TabScheme matched;

        TabPatch(String owner, List<TabScheme> schemes) {
            super(owner, "BADGE", "HEADSHIFT");
            this.schemes = schemes;
        }

        @Override
        MethodVisitor patchMethod(int access, String name, String desc, MethodVisitor mv) {
            if ((access & Opcodes.ACC_STATIC) != 0) return mv;
            TabScheme scheme = null;
            for (TabScheme s : schemes) {
                if (s.overlayMethod.equals(name) && s.overlayDesc.equals(desc)) scheme = s;
            }
            if (scheme == null) return mv;
            applied = true;
            this.matched = scheme;
            final TabScheme matched = scheme;
            return new MethodVisitor(Opcodes.ASM9, mv) {
                @Override
                public void visitInsn(int opcode) {
                    if (opcode == Opcodes.ARETURN) {
                        // name -> literal(badge.apply(playerInfo.getProfile())).append(name)
                        loadHook(mv, "BADGE");
                        super.visitVarInsn(Opcodes.ALOAD, 1);
                        super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, matched.playerInfoClass,
                                matched.getProfile, "()Lcom/mojang/authlib/GameProfile;", false);
                        super.visitMethodInsn(Opcodes.INVOKEINTERFACE, FUNCTION, "apply",
                                "(Ljava/lang/Object;)Ljava/lang/Object;", true);
                        super.visitTypeInsn(Opcodes.CHECKCAST, "java/lang/String");
                        super.visitMethodInsn(Opcodes.INVOKESTATIC, matched.componentClass,
                                matched.literal, matched.literalDesc, true);
                        super.visitInsn(Opcodes.SWAP);
                        super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, matched.mutableClass,
                                matched.append, matched.appendDesc, false);
                    }
                    super.visitInsn(opcode);
                }

                @Override
                public void visitMaxs(int maxStack, int maxLocals) {
                    super.visitMaxs(maxStack + 3, maxLocals);
                }
            };
        }
    }

    /**
     * BrandingControl.getBrandings(boolean includeMC, boolean reverse): copy the
     * returned list and add the brand on top of the stack of lines. Lines render
     * bottom-up from index 0 when reversed, so the brand goes at index
     * reverse * size, computed without a branch.
     */
    private final class BrandingPatch implements Patch {
        private boolean applied;

        @Override
        public boolean applied() {
            return applied;
        }

        @Override
        public ClassVisitor wrap(ClassVisitor next) {
            return new ClassVisitor(Opcodes.ASM9, next) {
                @Override
                public MethodVisitor visitMethod(int access, String name, String desc, String sig, String[] ex) {
                    MethodVisitor mv = super.visitMethod(access, name, desc, sig, ex);
                    if (!name.equals("getBrandings") || !desc.equals("(ZZ)Ljava/util/List;")
                            || (access & Opcodes.ACC_STATIC) == 0) {
                        return mv;
                    }
                    applied = true;
                    return new MethodVisitor(Opcodes.ASM9, mv) {
                        @Override
                        public void visitInsn(int opcode) {
                            if (opcode == Opcodes.ARETURN) {
                                // list -> copy = new ArrayList(list); copy.add(reverse * copy.size(), brand); return copy
                                super.visitTypeInsn(Opcodes.NEW, "java/util/ArrayList");
                                super.visitInsn(Opcodes.DUP_X1);
                                super.visitInsn(Opcodes.SWAP);
                                super.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/util/ArrayList", "<init>",
                                        "(Ljava/util/Collection;)V", false);
                                super.visitInsn(Opcodes.DUP);
                                super.visitInsn(Opcodes.DUP);
                                super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/util/ArrayList", "size",
                                        "()I", false);
                                super.visitVarInsn(Opcodes.ILOAD, 1);
                                super.visitInsn(Opcodes.IMUL);
                                super.visitLdcInsn(brand);
                                super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/util/ArrayList", "add",
                                        "(ILjava/lang/Object;)V", false);
                            }
                            super.visitInsn(opcode);
                        }

                        @Override
                        public void visitMaxs(int maxStack, int maxLocals) {
                            super.visitMaxs(maxStack + 5, maxLocals);
                        }
                    };
                }
            };
        }
    }
}
