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
 * never obfuscated (LWJGL, Forge/NeoForge BrandingControl), so one jar works
 * for every Minecraft version and loader.
 *
 * Injected code references java.base only and has no branches: values are
 * baked in as constants at transform time, so no stack map frames need to be
 * recomputed and Forge's module layers never have to read this jar.
 *
 * System properties set by the launcher:
 *   reality.title    full window title
 *   reality.brand    line added to the Forge/NeoForge title screen branding
 *   reality.session  properties file with the tab-badge lookup token and the
 *                    runtime names of the tab-list members (see TabScheme)
 */
public final class RealityAgent implements ClassFileTransformer {
    private static final String LWJGL3_GLFW = "org/lwjgl/glfw/GLFW";
    private static final String LWJGL2_DISPLAY = "org/lwjgl/opengl/Display";
    private static final String[] BRANDING_CONTROLS = {
            "net/minecraftforge/internal/BrandingControl",
            "net/minecraftforge/fml/BrandingControl",
            "net/neoforged/neoforge/internal/BrandingControl",
            "net/neoforged/fml/BrandingControl",
    };

    private final String title;
    private final String brand;
    private final List<TabScheme> tabSchemes;

    private RealityAgent(String title, String brand, List<TabScheme> tabSchemes) {
        this.title = title;
        this.brand = brand;
        this.tabSchemes = tabSchemes;
    }

    public static void premain(String args, Instrumentation inst) {
        String title = System.getProperty("reality.title");
        String brand = System.getProperty("reality.brand");
        List<TabScheme> tabSchemes = startTabBadges(System.getProperty("reality.session"));
        if (isBlank(title) && isBlank(brand) && tabSchemes.isEmpty()) return;
        inst.addTransformer(new RealityAgent(title, brand, tabSchemes));
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
            TabBadges badges = new TabBadges(file, props.getProperty("api.url"), badge);
            badges.start();
            TabBadges.INSTANCE = badges;
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
            if (!isBlank(title) && (className.equals(LWJGL3_GLFW) || className.equals(LWJGL2_DISPLAY))) {
                return rewrite(bytes, new TitleVisitor(className.equals(LWJGL3_GLFW)));
            }
            if (!isBlank(brand) && isBrandingControl(className)) {
                return rewrite(bytes, new BrandingVisitor());
            }
            List<TabScheme> schemes = schemesFor(className);
            if (!schemes.isEmpty()) {
                return rewrite(bytes, new TabVisitor(className, schemes));
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
     * LWJGL3 glfwSetWindowTitle(long, CharSequence) and glfwCreateWindow(int, int,
     * CharSequence, long, long) / LWJGL2 Display.setTitle(String): overwrite the
     * title argument on entry.
     */
    private final class TitleVisitor implements Patch {
        private final boolean lwjgl3;
        private boolean applied;

        TitleVisitor(boolean lwjgl3) {
            this.lwjgl3 = lwjgl3;
        }

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
                    final int slot;
                    if (lwjgl3 && name.equals("glfwSetWindowTitle") && desc.equals("(JLjava/lang/CharSequence;)V")) {
                        slot = 2;
                    } else if (lwjgl3 && name.equals("glfwCreateWindow") && desc.equals("(IILjava/lang/CharSequence;JJ)J")) {
                        // Forge's early loading window passes its title here and never calls setTitle.
                        slot = 2;
                    } else if (!lwjgl3 && name.equals("setTitle") && desc.equals("(Ljava/lang/String;)V")) {
                        slot = 0;
                    } else {
                        return mv;
                    }
                    if ((access & Opcodes.ACC_STATIC) == 0) return mv;
                    applied = true;
                    return new MethodVisitor(Opcodes.ASM9, mv) {
                        @Override
                        public void visitCode() {
                            super.visitCode();
                            super.visitLdcInsn(title);
                            super.visitVarInsn(Opcodes.ASTORE, slot);
                        }
                    };
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
    private final class BrandingVisitor implements Patch {
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

    /**
     * PlayerTabOverlay.getNameForDisplay(PlayerInfo): prefix the returned name with
     * the badge for Reality players. The badge function lives in TabBadges (agent
     * jar, system class loader); a static field added to the tab-list class holds
     * it, filled in the static initializer by reflection, so the game's module
     * layers never link against the agent. Several schemes can share the class
     * name (Forge official vs SRG members); the one whose method matches wins.
     */
    private static final class TabVisitor implements Patch {
        private static final String FIELD = "reality$badge";
        private static final String FUNCTION = "java/util/function/Function";

        private final String owner;
        private final List<TabScheme> schemes;
        private boolean applied;

        TabVisitor(String owner, List<TabScheme> schemes) {
            this.owner = owner;
            this.schemes = schemes;
        }

        @Override
        public boolean applied() {
            return applied;
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
                                emitFieldInit(mv);
                            }

                            @Override
                            public void visitMaxs(int maxStack, int maxLocals) {
                                super.visitMaxs(Math.max(maxStack, 3), maxLocals);
                            }
                        };
                    }
                    if ((access & Opcodes.ACC_STATIC) != 0) return mv;
                    TabScheme scheme = null;
                    for (TabScheme s : schemes) {
                        if (s.overlayMethod.equals(name) && s.overlayDesc.equals(desc)) scheme = s;
                    }
                    if (scheme == null) return mv;
                    applied = true;
                    final TabScheme matched = scheme;
                    return new MethodVisitor(Opcodes.ASM9, mv) {
                        @Override
                        public void visitInsn(int opcode) {
                            if (opcode == Opcodes.ARETURN) {
                                // name -> literal(badge.apply(playerInfo.getProfile())).append(name)
                                super.visitFieldInsn(Opcodes.GETSTATIC, owner, FIELD, "L" + FUNCTION + ";");
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

                @Override
                public void visitEnd() {
                    super.visitField(Opcodes.ACC_PRIVATE | Opcodes.ACC_STATIC | Opcodes.ACC_SYNTHETIC,
                            FIELD, "L" + FUNCTION + ";", null, null).visitEnd();
                    if (!hasClinit) {
                        MethodVisitor mv = super.visitMethod(Opcodes.ACC_STATIC, "<clinit>", "()V", null, null);
                        mv.visitCode();
                        emitFieldInit(mv);
                        mv.visitInsn(Opcodes.RETURN);
                        mv.visitMaxs(3, 0);
                        mv.visitEnd();
                    }
                    super.visitEnd();
                }
            };
        }

        /** reality$badge = (Function) Class.forName(TabBadges, true, systemLoader).getField("INSTANCE").get(null) */
        private void emitFieldInit(MethodVisitor mv) {
            mv.visitLdcInsn(TabBadges.class.getName());
            mv.visitInsn(Opcodes.ICONST_1);
            mv.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/ClassLoader", "getSystemClassLoader",
                    "()Ljava/lang/ClassLoader;", false);
            mv.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/Class", "forName",
                    "(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;", false);
            mv.visitLdcInsn("INSTANCE");
            mv.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/lang/Class", "getField",
                    "(Ljava/lang/String;)Ljava/lang/reflect/Field;", false);
            mv.visitInsn(Opcodes.ACONST_NULL);
            mv.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "java/lang/reflect/Field", "get",
                    "(Ljava/lang/Object;)Ljava/lang/Object;", false);
            mv.visitTypeInsn(Opcodes.CHECKCAST, FUNCTION);
            mv.visitFieldInsn(Opcodes.PUTSTATIC, owner, FIELD, "L" + FUNCTION + ";");
        }
    }
}
