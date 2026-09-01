"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");

/**
 * Ad-hoc signs the macOS app.
 *
 * Apple Silicon will not run an arm64 binary whose signature is missing or
 * broken — and it reports that as "Z&B Tracker is damaged and can't be opened",
 * which sounds like a corrupt download and isn't. Electron ships its binaries
 * ad-hoc signed; electron-builder then renames the app and rewrites its
 * Info.plist, which invalidates that signature. With no Apple certificate to
 * re-sign with, the app ends up broken rather than merely unsigned.
 *
 * `codesign --sign -` is the ad-hoc identity: no certificate, no notarization,
 * but a structurally valid signature. Gatekeeper then gives the ordinary
 * "unidentified developer" prompt that a right-click → Open gets past, instead
 * of refusing outright.
 *
 * A real Developer ID certificate would remove even that prompt. This is the
 * best that can be done without paying for one.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // Nested code has to be signed before the bundle that contains it, which is
  // what `--deep` handles. It is discouraged for real distribution signing, but
  // for an ad-hoc pass over frameworks and helpers it is the practical choice.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });

  // Fail the build rather than ship another "damaged" app.
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
    stdio: "inherit",
  });

  console.log(`  • ad-hoc signed  ${app}`);
};
