package space.catlabdesign.reality.agent;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;

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
 *   reality.title  full window title
 *   reality.brand  line added to the Forge/NeoForge title screen branding
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

    private RealityAgent(String title, String brand) {
        this.title = title;
        this.brand = brand;
    }

    public static void premain(String args, Instrumentation inst) {
        String title = System.getProperty("reality.title");
        String brand = System.getProperty("reality.brand");
        if (isBlank(title) && isBlank(brand)) return;
        inst.addTransformer(new RealityAgent(title, brand));
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
        } catch (Throwable t) {
            System.err.println("[RealityAgent] Skipping " + className + ": " + t);
        }
        return null;
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
     * LWJGL3 glfwSetWindowTitle(long, CharSequence) / LWJGL2 Display.setTitle(String):
     * overwrite the title argument on entry.
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
}
