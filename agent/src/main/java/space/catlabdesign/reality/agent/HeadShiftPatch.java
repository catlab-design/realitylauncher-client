package space.catlabdesign.reality.agent;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.IincInsnNode;
import org.objectweb.asm.tree.InsnList;
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
 * it), so the head renderer's own runtime name is never needed. The load of x
 * that feeds the call gets Hooks.HEADSHIFT(info.getProfile()) added right
 * after it, so everything between the load and the call sees the moved head:
 * mods hooking the call's arguments (Figura's @ModifyArg draws its avatar
 * portrait from the x it is handed) draw in the same place as vanilla. The
 * badge text, drawn with a negative-space prefix, then lands where the head
 * used to start.
 *
 * Runs on the output of TabPatch, which already added the reality$headshift
 * field and its initializer. Returns null when the shape isn't found.
 */
final class HeadShiftPatch {
    private static final String FUNCTION = "java/util/function/Function";

    private HeadShiftPatch() {
    }

    static byte[] apply(byte[] bytes, String owner, TabScheme scheme) {
        if (scheme == null) return null;
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);

        VarInsnNode xLoad = null;
        int infoSlot = -1;
        MethodNode host = null;
        for (MethodNode m : node.methods) {
            for (AbstractInsnNode insn = m.instructions.getFirst(); insn != null; insn = insn.getNext()) {
                if (!(insn instanceof MethodInsnNode) || insn.getOpcode() != Opcodes.INVOKESTATIC) continue;
                MethodInsnNode call = (MethodInsnNode) insn;
                IincInsnNode step = headDrawStep(call);
                if (step == null) continue;
                MethodInsnNode profile = profileCallBefore(call, scheme);
                int slot = playerInfoSlot(profile);
                if (slot < 0) continue;
                VarInsnNode load = xLoadBetween(profile, call, step.var);
                if (load == null) continue;
                if (xLoad != null) return null; // ambiguous: leave the layout alone
                xLoad = load;
                infoSlot = slot;
                host = m;
            }
        }
        if (xLoad == null) return null;

        InsnList shift = new InsnList();
        shift.add(new FieldInsnNode(Opcodes.GETSTATIC, owner, "reality$headshift", "L" + FUNCTION + ";"));
        shift.add(new VarInsnNode(Opcodes.ALOAD, infoSlot));
        shift.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, scheme.playerInfoClass,
                scheme.getProfile, "()Lcom/mojang/authlib/GameProfile;", false));
        shift.add(new MethodInsnNode(Opcodes.INVOKEINTERFACE, FUNCTION, "apply",
                "(Ljava/lang/Object;)Ljava/lang/Object;", true));
        shift.add(new TypeInsnNode(Opcodes.CHECKCAST, "java/lang/Integer"));
        shift.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "java/lang/Integer", "intValue", "()I", false));
        shift.add(new InsnNode(Opcodes.IADD));
        host.instructions.insert(xLoad, shift);
        host.maxStack += 2;

        ClassWriter writer = new ClassWriter(0);
        node.accept(writer);
        return writer.toByteArray();
    }

    /**
     * The "iinc x 9" right after a static void call taking at least three ints,
     * or null when the call doesn't have the head-draw shape.
     */
    private static IincInsnNode headDrawStep(MethodInsnNode call) {
        if (Type.getReturnType(call.desc) != Type.VOID_TYPE) return null;
        int ints = 0;
        for (Type t : Type.getArgumentTypes(call.desc)) if (t == Type.INT_TYPE) ints++;
        if (ints < 3) return null;
        AbstractInsnNode next = call.getNext();
        while (next != null && next.getOpcode() < 0) next = next.getNext(); // labels, line numbers, frames
        return next instanceof IincInsnNode && ((IincInsnNode) next).incr == 9 ? (IincInsnNode) next : null;
    }

    /** The last info.getProfile() call before the head call. */
    private static MethodInsnNode profileCallBefore(MethodInsnNode call, TabScheme scheme) {
        for (AbstractInsnNode insn = call.getPrevious(); insn != null; insn = insn.getPrevious()) {
            if (insn instanceof MethodInsnNode) {
                MethodInsnNode m = (MethodInsnNode) insn;
                if (m.getOpcode() == Opcodes.INVOKEVIRTUAL && m.owner.equals(scheme.playerInfoClass)
                        && m.name.equals(scheme.getProfile)
                        && m.desc.equals("()Lcom/mojang/authlib/GameProfile;")) {
                    return m;
                }
            }
        }
        return null;
    }

    /** Local slot of the PlayerInfo that getProfile() was called on. */
    private static int playerInfoSlot(MethodInsnNode profile) {
        if (profile == null) return -1;
        AbstractInsnNode load = profile.getPrevious();
        while (load != null && load.getOpcode() < 0) load = load.getPrevious();
        return load instanceof VarInsnNode && load.getOpcode() == Opcodes.ALOAD ? ((VarInsnNode) load).var : -1;
    }

    /**
     * The last load of local x before the head call, provided it comes after the
     * getProfile() call; injected code (mixin argument handlers) copies the
     * arguments into other locals, so this is the original argument push.
     */
    private static VarInsnNode xLoadBetween(MethodInsnNode profile, MethodInsnNode call, int x) {
        for (AbstractInsnNode insn = call.getPrevious(); insn != null && insn != profile; insn = insn.getPrevious()) {
            if (insn.getOpcode() == Opcodes.ILOAD && ((VarInsnNode) insn).var == x) return (VarInsnNode) insn;
        }
        return null;
    }
}
