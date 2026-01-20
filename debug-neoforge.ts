
export { };

(async () => {
    console.log("--- 1. Checking Prism Meta Index ---");
    try {
        const url = "https://meta.prismlauncher.org/v1/index.json";
        const res = await fetch(url, { headers: { "User-Agent": "RealityLauncher/1.0.0" } });
        console.log("Index Status:", res.status);
        if (res.ok) {
            const data = await res.json();
            console.log("Total Components:", data.components.length);
            const neoForge = data.components.filter((c: any) => c.uid.includes("neoforge") || c.name.toLowerCase().includes("neoforge"));
            console.log("NeoForge Components found:", neoForge);
        }
    } catch (e) {
        console.error("Index Error:", e);
    }

    console.log("\n--- 2. Checking Maven Fallback ---");
    try {
        const url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
        const res = await fetch(url, { headers: { "User-Agent": "RealityLauncher/1.0.0" } });
        console.log("Maven Status:", res.status);
        if (res.ok) {
            const data = await res.json();
            console.log("Maven Versions Found:", data.versions.length);
            console.log("Latest 5:", data.versions.slice(-5));
        } else {
            console.log("Maven Preview:", await res.text());
        }
    } catch (e) {
        console.error("Maven Error:", e);
    }
})();
