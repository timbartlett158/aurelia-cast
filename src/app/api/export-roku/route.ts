import { NextResponse } from "next/server";
import archiver from "archiver";
import { buildRokuPackage, validateSettings } from "@/lib/roku/templates";
import type { RokuExportSettings } from "@/lib/types";

export async function POST(req: Request) {
  let body: Partial<RokuExportSettings>;
  try {
    body = (await req.json()) as Partial<RokuExportSettings>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const settings: RokuExportSettings = {
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Aurelia Cast",
    port: Number.isInteger(body.port) ? (body.port as number) : 8080,
    accent: body.accent ?? "Gold",
  };

  const errors = validateSettings(settings);
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const slug = settings.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "aurelia-cast";
  const files = buildRokuPackage(settings);

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  for (const file of files) {
    archive.append(file.content, { name: file.name });
  }
  void archive.finalize();
  await done;

  const zip = Buffer.concat(chunks);
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-roku.zip"`,
      "X-Roku-File-Count": String(files.length),
    },
  });
}
