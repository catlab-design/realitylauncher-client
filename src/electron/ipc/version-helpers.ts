export function packFormatToVersion(
  format: number,
  type: "resource" | "data" = "resource",
): string {
  if (type === "resource") {
    const resourcePackFormats: Record<number, string> = {
      1: "1.6.1 - 1.8.9",
      2: "1.9 - 1.10.2",
      3: "1.11 - 1.12.2",
      4: "1.13 - 1.14.4",
      5: "1.15 - 1.16.1",
      6: "1.16.2 - 1.16.5",
      7: "1.17 - 1.17.1",
      8: "1.18 - 1.18.2",
      9: "1.19 - 1.19.2",
      12: "1.19.3",
      13: "1.19.4",
      15: "1.20 - 1.20.1",
      18: "1.20.2",
      22: "1.20.3 - 1.20.4",
      32: "1.20.5 - 1.20.6",
      34: "1.21 - 1.21.1",
      42: "1.21.2 - 1.21.3",
      46: "1.21.4",
      48: "1.21.5",
    };
    return resourcePackFormats[format] || `Format ${format}`;
  }

  const dataPackFormats: Record<number, string> = {
    4: "1.13 - 1.14.4",
    5: "1.15 - 1.16.1",
    6: "1.16.2 - 1.16.5",
    7: "1.17 - 1.17.1",
    8: "1.18 - 1.18.1",
    9: "1.18.2",
    10: "1.19 - 1.19.3",
    12: "1.19.4",
    15: "1.20 - 1.20.1",
    18: "1.20.2",
    26: "1.20.3 - 1.20.4",
    41: "1.20.5 - 1.20.6",
    48: "1.21 - 1.21.1",
    57: "1.21.2 - 1.21.3",
    61: "1.21.4",
    71: "1.21.5",
  };
  return dataPackFormats[format] || `Format ${format}`;
}

export function inferVersionFromFilename(filename: string): string | undefined {
  const normalized = filename
    .replace(/\.disabled$/i, "")
    .replace(/\.(jar|zip)$/i, "");

  const matches = Array.from(
    normalized.matchAll(
      /(?:^|[\s._+\-)\]])v?(\d+(?:\.\d+){1,3}(?:(?:[-._]?(?:alpha|beta|rc|pre|snapshot)\d*))?)/gi,
    ),
  ).map((match) => match[1]);

  if (matches.length === 0) return undefined;
  return matches[matches.length - 1];
}
