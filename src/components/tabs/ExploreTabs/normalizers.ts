



import type { ModrinthProject, ProjectVersion } from "./types";
import { normalizeImageUrl } from "./helpers";

const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];

function splitCfGameVersions(rawGv: any[] | undefined): { loaders: string[]; gameVersions: string[] } {
    const loaders: string[] = [];
    const gameVersions: string[] = [];
    if (!rawGv || !Array.isArray(rawGv)) return { loaders, gameVersions };
    for (const gv of rawGv) {
        if (!gv) continue;
        const lower = String(gv).toLowerCase();
        if (KNOWN_LOADERS.includes(lower)) {
            if (!loaders.includes(lower)) loaders.push(lower);
        } else if (!lower.includes("client") && !lower.includes("server")) {
            gameVersions.push(gv);
        }
    }
    return { loaders, gameVersions };
}

export function normalizeModrinthFull(
    fullProject: any,
    base: ModrinthProject,
    unknownLabel: string,
): ModrinthProject {
    return {
        slug: fullProject.slug,
        title: fullProject.title,
        description: fullProject.description,
        categories: fullProject.categories || fullProject.displayCategories || fullProject.display_categories || [],
        downloads: fullProject.downloads,
        icon_url: normalizeImageUrl(fullProject.icon_url || fullProject.iconUrl || null, "modrinth"),
        project_id: fullProject.project_id || fullProject.projectId || base.project_id,
        author: fullProject.author || base.author || unknownLabel,
        versions: fullProject.versions || base.versions || [],
        game_versions: fullProject.game_versions || fullProject.gameVersions || base.game_versions || [],
        loaders: fullProject.loaders || base.loaders || [],
        follows: fullProject.followers || fullProject.follows || 0,
        client_side: fullProject.clientSide || fullProject.client_side,
        server_side: fullProject.serverSide || fullProject.server_side,
        gallery: fullProject.gallery || [],
        featured_gallery: base.featured_gallery || fullProject.featured_gallery || fullProject.featuredGallery || null,
        color: fullProject.color || base.color,
        body: fullProject.body || base.body || "",
        source_url: fullProject.source_url || fullProject.sourceUrl || base.source_url,
        wiki_url: fullProject.wiki_url || fullProject.wikiUrl || base.wiki_url,
        discord_url: fullProject.discord_url || fullProject.discordUrl || base.discord_url,
        issues_url: fullProject.issues_url || fullProject.issuesUrl || base.issues_url,
        license: fullProject.license || base.license,
        date_created: fullProject.published || fullProject.date_created || fullProject.dateCreated || base.date_created,
        date_modified: fullProject.updated || fullProject.date_modified || fullProject.dateModified || base.date_modified,
        source: "modrinth",
    };
}

export function normalizeCurseforgeFull(
    cf: any,
    base: ModrinthProject,
    unknownLabel: string,
    body?: string,
): ModrinthProject {
    
    
    const gvs = new Set<string>();
    const lds = new Set<string>();
    const files = cf.latestFiles || cf.latest_files || [];
    if (Array.isArray(files)) {
        for (const file of files) {
            const { loaders, gameVersions } = splitCfGameVersions(file.gameVersions);
            loaders.forEach(l => lds.add(l));
            gameVersions.forEach(g => gvs.add(g));
        }
    }
    if (Array.isArray(cf.gameVersions)) {
        const split = splitCfGameVersions(cf.gameVersions);
        split.loaders.forEach(l => lds.add(l));
        split.gameVersions.forEach(g => gvs.add(g));
    }
    return {
        slug: cf.slug || cf.id.toString(),
        title: cf.name,
        description: cf.summary,
        categories: cf.categories?.map((c: any) => c.name) || [],
        downloads: cf.downloadCount,
        icon_url: normalizeImageUrl(cf.logo?.url || null, "curseforge"),
        project_id: cf.id.toString(),
        author: cf.authors?.[0]?.name || base.author || unknownLabel,
        versions: cf.latestFiles?.flatMap((f: any) => f.gameVersions) || base.versions || [],
        game_versions: gvs.size > 0 ? Array.from(gvs) : (base.game_versions || []),
        loaders: lds.size > 0 ? Array.from(lds) : (base.loaders || []),
        follows: cf.thumbsUpCount || 0,
        client_side: "required",
        server_side: "optional",
        gallery: cf.screenshots?.map((s: any) => ({ url: s.url, featured: false, created: "", ordering: 0 })) || [],
        featured_gallery: cf.screenshots?.[0]?.url || base.featured_gallery || null,
        body: body || base.body || "",
        source_url: cf.links?.sourceUrl || base.source_url,
        wiki_url: cf.links?.wikiUrl || base.wiki_url,
        issues_url: cf.links?.issuesUrl || base.issues_url,
        discord_url: cf.links?.discordUrl || base.discord_url,
        date_created: cf.dateCreated || base.date_created,
        date_modified: cf.dateModified || base.date_modified,
        team_members: cf.authors?.map((a: any) => ({ user: { username: a.name }, role: "Author" })) || base.team_members,
        source: "curseforge",
    };
}

export function normalizeModrinthVersion(v: any): ProjectVersion {
    return {
        id: v.id,
        name: v.name || v.versionNumber || v.version_number || "",
        version_number: v.versionNumber || v.version_number || v.name || "",
        game_versions: v.gameVersions || v.game_versions || [],
        loaders: v.loaders || [],
        version_type: v.versionType || v.version_type || "release",
        downloads: v.downloads || 0,
        date_published: v.datePublished || v.date_published || "",
        files: (v.files || []).map((f: any) => ({
            filename: f.filename,
            size: f.size || 0,
            primary: f.primary || false,
            url: f.url || "",
        })),
        changelog: v.changelog || "",
    };
}

export function normalizeModrinthSearchHit(mr: any, unknownLabel: string): ModrinthProject {
    return {
        source: "modrinth",
        slug: mr.slug,
        title: mr.title,
        description: mr.description,
        categories: mr.categories || mr.displayCategories || mr.display_categories || [],
        downloads: mr.downloads,
        icon_url: normalizeImageUrl(mr.iconUrl || mr.icon_url || null, "modrinth"),
        project_id: mr.projectId || mr.project_id,
        author: mr.author || unknownLabel,
        versions: mr.versions || [],
        game_versions: mr.gameVersions || mr.game_versions || [],
        loaders: mr.loaders || [],
        follows: mr.follows,
        client_side: mr.clientSide || mr.client_side,
        server_side: mr.serverSide || mr.server_side,
        date_created: mr.date_created,
        date_modified: mr.date_modified,
        license: mr.license ? { id: mr.license, name: mr.license } : undefined,
        gallery: mr.gallery?.map((url: string) => ({ url, featured: false, created: "", ordering: 0 })) || [],
        featured_gallery: mr.featuredGallery || mr.featured_gallery || null,
    };
}

export function normalizeCurseforgeSearchHit(cf: any, unknownLabel: string): ModrinthProject {
    const gvs = new Set<string>();
    const lds = new Set<string>();
    const files = cf.latestFiles || cf.latest_files || [];
    if (Array.isArray(files)) {
        for (const file of files) {
            const split = splitCfGameVersions(file.gameVersions);
            split.loaders.forEach(l => lds.add(l));
            split.gameVersions.forEach(g => gvs.add(g));
        }
    }
    if (Array.isArray(cf.gameVersions)) {
        const split = splitCfGameVersions(cf.gameVersions);
        split.loaders.forEach(l => lds.add(l));
        split.gameVersions.forEach(g => gvs.add(g));
    }
    return {
        source: "curseforge",
        slug: cf.slug || cf.id.toString(),
        title: cf.name,
        description: cf.summary,
        categories: cf.categories?.map((c: any) => c.name) || [],
        downloads: cf.downloadCount,
        icon_url: normalizeImageUrl(cf.logo?.url || null, "curseforge"),
        project_id: cf.id.toString(),
        author: cf.authors?.[0]?.name || unknownLabel,
        team_members: cf.authors?.map((a: any) => ({ user: { username: a.name }, role: "Author" })) || [],
        versions: [],
        game_versions: Array.from(gvs),
        loaders: Array.from(lds),
        follows: cf.thumbsUpCount || 0,
        client_side: "required",
        server_side: "optional",
        source_url: cf.links?.sourceUrl || undefined,
        wiki_url: cf.links?.wikiUrl || undefined,
        issues_url: cf.links?.issuesUrl || undefined,
        date_created: cf.dateCreated,
        date_modified: cf.dateModified,
        gallery: cf.screenshots?.map((s: any) => ({ url: s.url, featured: false, created: "", ordering: 0 })) || [],
        featured_gallery: cf.screenshots?.[0]?.url || null,
    };
}

export function normalizeCurseforgeVersion(f: any): ProjectVersion {
    const { loaders, gameVersions } = splitCfGameVersions(f.gameVersions);
    if (f.sortableGameVersions) {
        for (const sv of f.sortableGameVersions) {
            const name = sv.gameVersionName?.toLowerCase();
            if (name && KNOWN_LOADERS.includes(name) && !loaders.includes(name)) loaders.push(name);
        }
    }
    return {
        id: f.id.toString(),
        name: f.displayName || f.fileName,
        version_number: f.displayName || f.fileName,
        game_versions: gameVersions,
        loaders,
        version_type: f.releaseType === 3 ? "alpha" : f.releaseType === 2 ? "beta" : "release",
        downloads: f.downloadCount || 0,
        date_published: f.fileDate || "",
        files: [{
            filename: f.fileName,
            size: f.fileLength || 0,
            primary: true,
            url: f.downloadUrl || "",
        }],
    };
}
