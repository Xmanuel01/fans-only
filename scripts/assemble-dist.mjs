import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist");

const appBuilds = [
  { name: "landing", from: path.join(rootDir, "landingpage", "dist"), to: path.join(outputDir, "app") },
  { name: "creator", from: path.join(rootDir, "creator-side", "dist"), to: path.join(outputDir, "creator") },
  { name: "user", from: path.join(rootDir, "user-side", "dist"), to: path.join(outputDir, "user") },
];

function assertExists(fullPath, label) {
  if (!fs.existsSync(fullPath)) {
    throw new Error(`[assemble-dist] Missing ${label}: ${fullPath}`);
  }
}

function copyTree(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function main() {
  for (const build of appBuilds) {
    assertExists(build.from, `${build.name} build output`);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const build of appBuilds) {
    copyTree(build.from, build.to);
    console.log(`[assemble-dist] Copied ${build.name} -> ${path.relative(rootDir, build.to)}`);
  }

  console.log(`[assemble-dist] Unified output ready: ${path.relative(rootDir, outputDir)}`);
}

main();
