package space.catlabdesign.reality.agent;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.IincInsnNode;
import org.objectweb.asm.tree.InsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.VarInsnNode;

/**
 * Makes room for the badge left of the player head in the tab list.
 *
 * Every 1.19-1.21 tab list draws a row as
 *   PlayerFaceRenderer.draw(..., x, y, 8, ...); x += 9;  drawString(getNameForDisplay(info), x, ...)
 * The head-drawing call is found by that shape (a static void call with int
 * args followed by "x += 9", in a method that reads info.getProfile() before
 * it), so the head renderer's own runtime name is never needed. The call is
 * rerouted through an added method that moves the head right by
 * Hooks.HEADSHIFT(info.getProfile()) pixels; the badge text, drawn with a
 * negative-space prefix, then lands where the head used to start.
 *
 * Runs on the output of TabPatch, which already added the reality$headshift
 * field and its initializer. Returns null when the shape isn't found.
 */
final class HeadShiftPatch {
    private static final String METHOD = "reality$drawHead";
    private static final String FUNCTION = "java/util/function/Function";

    private HeadShiftPatch() {
    }

    static byte[] apply(byte[] bytes, String owner, TabScheme scheme) {
        if (scheme == null) return null;
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);

        MethodInsnNode headCall = null;
        int infoSlot = -1;
        MethodNode host = null;
        for (MethodNode m : node.methods) {
            for (AbstractInsnNode insn = m.instructions.getFirst(); insn != null; insn = insn.getNext()) {
                if (!(insn instanceof MethodInsnNode) || insn.getOpcode() != Opcodes.INVOKESTATIC) continue;
                MethodInsnNode call = (MethodInsnNode) insn;
                if (!isHeadDrawShape(call)) continue;
                int slot = playerInfoSlotBefore(call, scheme);
                if (slot < 0) continue;
                if (headCall != null) return null; // ambiguous: leave the layout alone
                headCall = call;
                infoSlot = slot;
                host = m;
            }
        }
        if (headCall == null) return null;

        String wrapperDesc = headCall.desc.replace(")V", "L" + scheme.playerInfoClass + ";)V");
        host.instructions.insertBefore(headCall, new VarInsnNode(Opcodes.ALOAD, infoSlot));
        host.instructions.set(headCall, new MethodInsnNode(Opcodes.INVOKESTATIC, owner, METHOD, wrapperDesc, false));
        host.maxStack += 1;
        node.methods.add(wrapper(owner, headCall, wrapperDesc, scheme));

        ClassWriter writer = new ClassWriter(0);
        node.accept(writer);
        return writer.toByteArray();
    }

    /** static void call taking at least three ints, immediately followed by "iinc x 9". */
    private static boolean isHeadDrawShape(MethodInsnNode call) {
        Type[] args = Type.getArgumentTypes(call.desc);
        if (Type.getReturnType(call.desc) != Type.VOID_TYPE) return false;
        int ints = 0;
        for (Type t : args) if (t == Type.INT_TYPE) ints++;
        if (ints < 3) return false;
        AbstractInsnNode next = call.getNext();
        while (next != null && next.getOpcode() < 0) next = next.getNext(); // labels, line numbers, frames
        return next instanceof IincInsnNode && ((IincInsnNode) next).incr == 9;
    }

    /** Local slot of the PlayerInfo whose getProfile() was last called before the head call. */
    private static int playerInfoSlotBefore(MethodInsnNode call, TabScheme scheme) {
        for (AbstractInsnNode insn = call.getPrevious(); insn != null; insn = insn.getPrevious()) {
            if (insn instanceof MethodInsnNode) {
                MethodInsnNode m = (MethodInsnNode) insn;
                if (m.getOpcode() == Opcodes.INVOKEVIRTUAL && m.owner.equals(scheme.playerInfoClass)
                        && m.name.equals(scheme.getProfile)
                        && m.desc.equals("()Lcom/mojang/authlib/GameProfile;")) {
                    AbstractInsnNode load = m.getPrevious();
                    while (load != null && load.getOpcode() < 0) load = load.getPrevious();
                    return load instanceof VarInsnNode && load.getOpcode() == Opcodes.ALOAD
                            ? ((VarInsnNode) load).var
                            : -1;
                }
            }
        }
        return -1;
    }

    /**
     * static void reality$drawHead(&lt;original args&gt;, PlayerInfo info) {
     *     original(args with firstInt + (Integer) reality$headshift.apply(info.getProfile()));
     * }
     */
    private static MethodNode wrapper(String owner, MethodInsnNode original, String desc, TabScheme scheme) {
        MethodNode m = new MethodNode(Opcodes.ACC_PRIVATE | Opcodes.ACC_STATIC | Opcodes.ACC_SYNTHETIC,
                METHOD, desc, null, null);
        Type[] args = Type.getArgumentTypes(original.desc);
        int slot = 0;
        boolean shifted = false;
        for (Type t : args) {
            m.instructions.add(new VarInsnNode(t.getOpcode(Opcodes.ILOAD), slot));
            if (!shifted && t == Type.INT_TYPE) {
                shifted = true;
                m.instructions.add(new FieldInsnNode(Opcodes.GETSTATIC, owner, "reality$headshift", "L" + FUNCTION + ";"));
                m.instructions.add(new VarInsnNode(Opcodes.ALOAD, infoSlot(args)));
                m.instructions.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, scheme.playerInfoClass,
                        scheme.getProfile, "()Lcom/mojang/authlib/GameProfile;", false));
                m.instructions.add(new MethodInsnNode(Opcodes.INVOKEINTERFACE, FUNCTION, "apply",
                        "(Ljava/lang/Object;)Ljava/lang/Object;", true));
                m.instructions.add(new TypeInsnNode(Opcodes.CHECKCAST, "java/lang/Integer"));
                m.instructions.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "java/lang/Integer", "intValue", "()I", false));
                m.instructions.add(new InsnNode(Opcodes.IADD));
            }
            slot += t.getSize();
        }
        m.instructions.add(new MethodInsnNode(Opcodes.INVOKESTATIC, original.owner, original.name, original.desc,
                original.itf));
        m.instructions.add(new InsnNode(Opcodes.RETURN));
        m.maxLocals = slot + 1;
        m.maxStack = slot + 3;
        return m;
    }

    private static int infoSlot(Type[] args) {
        int slot = 0;
        for (Type t : args) slot += t.getSize();
        return slot;
    }
}
