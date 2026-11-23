package space.catlabdesign.reality.hotswap;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON for the channel files. Parses into Map / List / String / Long /
 * Double / Boolean / null; writes the same types (ASCII output). Throws
 * IllegalArgumentException on malformed input.
 */
final class Json {
    private final String s;
    private int i;

    private Json(String s) { this.s = s; }

    static Object parse(String text) {
        Json p = new Json(text);
        p.ws();
        Object v = p.value(0);
        p.ws();
        if (p.i != p.s.length()) throw p.err("trailing data");
        return v;
    }

    private IllegalArgumentException err(String m) {
        return new IllegalArgumentException("json: " + m + " at " + i);
    }

    private void ws() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++; else break;
        }
    }

    private Object value(int depth) {
        if (depth > 64) throw err("too deep");
        if (i >= s.length()) throw err("unexpected end");
        char c = s.charAt(i);
        switch (c) {
            case '{': return object(depth);
            case '[': return array(depth);
            case '"': return string();
            case 't': return literal("true", Boolean.TRUE);
            case 'f': return literal("false", Boolean.FALSE);
            case 'n': return literal("null", null);
            default: return number();
        }
    }

    private Object literal(String word, Object v) {
        if (!s.startsWith(word, i)) throw err("bad literal");
        i += word.length();
        return v;
    }

    private Object number() {
        int start = i;
        if (i < s.length() && s.charAt(i) == '-') i++;
        boolean integral = true;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c >= '0' && c <= '9') i++;
            else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { integral = false; i++; }
            else break;
        }
        String t = s.substring(start, i);
        if (t.isEmpty() || t.equals("-")) throw err("bad number");
        try {
            if (integral) {
                try { return Long.valueOf(t); } catch (NumberFormatException big) { return Double.valueOf(t); }
            }
            return Double.valueOf(t);
        } catch (NumberFormatException e) {
            throw err("bad number");
        }
    }

    private String string() {
        i++; // opening quote
        StringBuilder b = new StringBuilder();
        while (true) {
            if (i >= s.length()) throw err("unterminated string");
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c != '\\') { b.append(c); continue; }
            if (i >= s.length()) throw err("bad escape");
            char e = s.charAt(i++);
            switch (e) {
                case '"': b.append('"'); break;
                case '\\': b.append('\\'); break;
                case '/': b.append('/'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'n': b.append('\n'); break;
                case 'r': b.append('\r'); break;
                case 't': b.append('\t'); break;
                case 'u':
                    if (i + 4 > s.length()) throw err("bad unicode escape");
                    try { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); }
                    catch (NumberFormatException x) { throw err("bad unicode escape"); }
                    i += 4;
                    break;
                default: throw err("bad escape");
            }
        }
    }

    private List<Object> array(int depth) {
        i++;
        List<Object> out = new ArrayList<>();
        ws();
        if (i < s.length() && s.charAt(i) == ']') { i++; return out; }
        while (true) {
            ws();
            out.add(value(depth + 1));
            ws();
            if (i >= s.length()) throw err("unterminated array");
            char c = s.charAt(i++);
            if (c == ']') return out;
            if (c != ',') throw err("expected , or ]");
        }
    }

    private Map<String, Object> object(int depth) {
        i++;
        Map<String, Object> out = new LinkedHashMap<>();
        ws();
        if (i < s.length() && s.charAt(i) == '}') { i++; return out; }
        while (true) {
            ws();
            if (i >= s.length() || s.charAt(i) != '"') throw err("expected key");
            String k = string();
            ws();
            if (i >= s.length() || s.charAt(i++) != ':') throw err("expected :");
            ws();
            out.put(k, value(depth + 1));
            ws();
            if (i >= s.length()) throw err("unterminated object");
            char c = s.charAt(i++);
            if (c == '}') return out;
            if (c != ',') throw err("expected , or }");
        }
    }

    // ---- writer ----

    static String write(Object v) {
        StringBuilder b = new StringBuilder();
        write(b, v);
        return b.toString();
    }

    private static void write(StringBuilder b, Object v) {
        if (v == null) b.append("null");
        else if (v instanceof String) quote(b, (String) v);
        else if (v instanceof Boolean || v instanceof Long || v instanceof Integer) b.append(v);
        else if (v instanceof Number) b.append(((Number) v).doubleValue());
        else if (v instanceof Map) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(b, String.valueOf(e.getKey()));
                b.append(':');
                write(b, e.getValue());
            }
            b.append('}');
        } else if (v instanceof Iterable) {
            b.append('[');
            boolean first = true;
            for (Object o : (Iterable<?>) v) {
                if (!first) b.append(',');
                first = false;
                write(b, o);
            }
            b.append(']');
        } else throw new IllegalArgumentException("json: unsupported " + v.getClass());
    }

    private static void quote(StringBuilder b, String s) {
        b.append('"');
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        b.append('"');
    }
}
