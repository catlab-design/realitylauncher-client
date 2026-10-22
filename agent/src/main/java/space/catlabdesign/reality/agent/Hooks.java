package space.catlabdesign.reality.agent;

import java.util.function.Function;

/**
 * Logic the patched game classes call into. Each patched class gets a static
 * reality$&lt;name&gt; field copied from here by reflection in its static
 * initializer (see RealityAgent.HookFields), so game classes never link
 * against the agent jar. Defaults are no-ops; premain installs the real ones.
 */
public final class Hooks {
    /** CharSequence title -> title to show. */
    public static Function<Object, Object> TITLE = title -> title;
    /** GLFWImage.Buffer -> same buffer, pixels possibly replaced in place. */
    public static Function<Object, Object> ICON = images -> images;
    /** GameProfile -> tab-list badge prefix ("" for none). */
    public static Function<Object, Object> BADGE = profile -> "";
    /** GameProfile -> Integer pixels to move this row's tab-list head right (room for the badge). */
    public static Function<Object, Object> HEADSHIFT = profile -> 0;

    private Hooks() {
    }
}
