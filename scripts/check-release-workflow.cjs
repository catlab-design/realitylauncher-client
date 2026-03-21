const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(
  process.cwd(),
  ".github",
  "workflows",
  "build.yml",
);
const workflow = fs.readFileSync(workflowPath, "utf8");

const expectations = [
  {
    name: "linux release build produces AppImage, deb, and rpm packages",
    pattern:
      /Build Electron app \(Linux(?: packages)?\)[\s\S]*?electron-builder --linux AppImage deb rpm --publish never/,
  },
  {
    name: "linux release workflow generates a Flatpak repo and .flatpakref",
    pattern:
      /Generate Flatpak repo and ref[\s\S]*?flatpak build-import-bundle[\s\S]*?\.flatpakref/,
  },
  {
    name: "linux artifacts upload includes .flatpakref and flatpak repo contents",
    pattern:
      /Upload Linux artifacts[\s\S]*?release-build\/\*\.flatpakref[\s\S]*?release-build\/flatpak-repo\/\*\*/,
  },
  {
    name: "release upload includes flatpakref asset",
    pattern:
      /Create GitHub Release[\s\S]*?artifacts\/reality-launcher-linux\/\*\.flatpakref/,
  },
  {
    name: "R2 upload includes flatpakref and flatpak repo files",
    pattern:
      /Upload Linux builds to R2[\s\S]*?\.flatpakref[\s\S]*?flatpak-repo/,
  },
];

const failures = expectations.filter(({ pattern }) => !pattern.test(workflow));

if (failures.length > 0) {
  console.error("Release workflow regression check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log("Release workflow regression check passed.");
