package space.catlabdesign.reality.agent;

import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.BufferedInputStream;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.CRC32;

/**
 * Window title and icon. Only Minecraft's own defaults are replaced: a title
 * or icon set by a mod is left alone.
 */
final class WindowHooks {
    private WindowHooks() {
    }

    /**
     * Vanilla: "Minecraft[*] &lt;version&gt;[ - &lt;status&gt;]" (status is translated).
     * Forge/NeoForge patch in their name: "Minecraft* Forge 1.20.1 - Singleplayer";
     * NeoForge puts the "modified" star after it: "Minecraft NeoForge* 1.21.1".
     * Forge/NeoForge early loading window: "Minecraft: Forge ..." / "Minecraft: NeoForge ...".
     */
    static Pattern defaultTitlePattern(String mcVersion) {
        String version = mcVersion == null || mcVersion.trim().isEmpty()
                ? "\\d\\S*"
                : Pattern.quote(mcVersion.trim());
        return Pattern.compile("Minecraft\\*?( (Neo)?Forge\\*?)? " + version + "( - .*)?|Minecraft: (Neo)?Forge.*",
                Pattern.DOTALL);
    }

    static java.util.function.Function<Object, Object> titleHook(String replacement, String mcVersion) {
        Pattern defaults = defaultTitlePattern(mcVersion);
        return title -> {
            try {
                if (title != null && defaults.matcher(title.toString()).matches()) return replacement;
            } catch (Throwable ignored) {
                // Fall through to the game's own title.
            }
            return title;
        };
    }

    /** One decoded icon size, RGBA. */
    static final class IconImage {
        final int width;
        final int height;
        final byte[] rgba;

        IconImage(int width, int height, byte[] rgba) {
            this.width = width;
            this.height = height;
            this.rgba = rgba;
        }

        /** RGBA at the requested size: exact match, else nearest-neighbour from the largest. */
        static byte[] scaled(List<IconImage> icons, int width, int height) {
            IconImage best = null;
            for (IconImage icon : icons) {
                if (icon.width == width && icon.height == height) return icon.rgba;
                if (best == null || icon.width * icon.height > best.width * best.height) best = icon;
            }
            byte[] out = new byte[width * height * 4];
            for (int y = 0; y < height; y++) {
                int sy = y * best.height / height;
                for (int x = 0; x < width; x++) {
                    int sx = x * best.width / width;
                    System.arraycopy(best.rgba, (sy * best.width + sx) * 4, out, (y * width + x) * 4, 4);
                }
            }
            return out;
        }
    }

    /** File written by the launcher: "RLIC", u32 count, then per image u32 width, u32 height, RGBA bytes (big-endian). */
    static List<IconImage> readIcons(File file) throws Exception {
        List<IconImage> icons = new ArrayList<>();
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(file)))) {
            byte[] magic = new byte[4];
            in.readFully(magic);
            if (magic[0] != 'R' || magic[1] != 'L' || magic[2] != 'I' || magic[3] != 'C') {
                throw new IllegalArgumentException("not an icon file");
            }
            int count = in.readInt();
            for (int i = 0; i < count; i++) {
                int w = in.readInt();
                int h = in.readInt();
                if (w <= 0 || h <= 0 || w > 1024 || h > 1024) throw new IllegalArgumentException("bad icon size");
                byte[] rgba = new byte[w * h * 4];
                in.readFully(rgba);
                icons.add(new IconImage(w, h, rgba));
            }
        }
        if (icons.isEmpty()) throw new IllegalArgumentException("no icons");
        return icons;
    }

    static String fingerprint(ByteBuffer pixels) {
        CRC32 crc = new CRC32();
        crc.update(pixels.duplicate());
        return String.format("%08x", crc.getValue());
    }

    static Set<String> parseFingerprints(String list) {
        Set<String> out = new HashSet<>();
        if (list == null) return out;
        for (String part : list.split(",")) {
            String p = part.trim().toLowerCase();
            if (!p.isEmpty()) out.add(p);
        }
        return out;
    }

    /**
     * glfwSetWindowIcon(window, GLFWImage.Buffer): when every image is one of
     * Minecraft's default icons, overwrite their pixels in place with ours.
     * LWJGL is reached by reflection: under Forge it lives in another class
     * loader / module layer than the agent.
     */
    static java.util.function.Function<Object, Object> iconHook(List<IconImage> icons, Set<String> vanilla) {
        return buffer -> {
            try {
                replaceDefaultIcon(buffer, icons, vanilla);
            } catch (Throwable ignored) {
                // Leave the game's icon as it is.
            }
            return buffer;
        };
    }

    private static void replaceDefaultIcon(Object buffer, List<IconImage> icons, Set<String> vanilla) throws Exception {
        if (buffer == null || vanilla.isEmpty()) return;
        Class<?> bufferClass = buffer.getClass();
        int count = (Integer) bufferClass.getMethod("remaining").invoke(buffer);
        int start = (Integer) bufferClass.getMethod("position").invoke(buffer);
        Method get = bufferClass.getMethod("get", int.class);

        List<Object> images = new ArrayList<>();
        List<ByteBuffer> pixels = new ArrayList<>();
        List<int[]> sizes = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Object image = get.invoke(buffer, start + i);
            Class<?> imageClass = image.getClass();
            int w = (Integer) imageClass.getMethod("width").invoke(image);
            int h = (Integer) imageClass.getMethod("height").invoke(image);
            ByteBuffer px = (ByteBuffer) imageClass.getMethod("pixels", int.class).invoke(image, w * h * 4);
            if (px == null || !vanilla.contains(fingerprint(px))) return; // a mod's icon: respect it
            images.add(image);
            pixels.add(px);
            sizes.add(new int[] {w, h});
        }
        for (int i = 0; i < pixels.size(); i++) {
            ByteBuffer px = pixels.get(i).duplicate();
            px.clear();
            px.put(IconImage.scaled(icons, sizes.get(i)[0], sizes.get(i)[1]));
        }
    }
}
