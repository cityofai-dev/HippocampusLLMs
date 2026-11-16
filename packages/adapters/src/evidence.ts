import { createHash } from "node:crypto";
import {
  openSync,
  closeSync,
  fstatSync,
  readSync,
  realpathSync,
  constants,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { EvidenceReader } from "../../core/src/providers.js";

/** Reads only small regular files contained in the canonical project root. Never executes evidence. */
export function projectEvidence(root: string): EvidenceReader {
  const canonical = realpathSync(root);
  return {
    check(evidence) {
      if (evidence.type !== "path") return { state: "unsupported" };
      if (isAbsolute(evidence.reference)) return { state: "unsupported" };
      let descriptor: number | undefined;
      try {
        const path = realpathSync(resolve(canonical, evidence.reference));
        const rel = relative(canonical, path);
        if (
          rel === ".." ||
          rel.startsWith("../") ||
          rel.startsWith("..\\") ||
          isAbsolute(rel)
        )
          return { state: "unsupported" };
        descriptor = openSync(
          path,
          constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        const stat = fstatSync(descriptor);
        if (!stat.isFile() || stat.size > 1024 * 1024)
          return { state: "unsupported" };
        const bytes = Buffer.alloc(1024 * 1024 + 1);
        let size = 0,
          n = 0;
        do {
          n = readSync(descriptor, bytes, size, bytes.length - size, null);
          size += n;
        } while (n && size < bytes.length);
        const after = fstatSync(descriptor);
        if (
          size > 1024 * 1024 ||
          after.size !== stat.size ||
          after.mtimeMs !== stat.mtimeMs
        )
          return { state: "unsupported" };
        const currentHash =
          "sha256:" +
          createHash("sha256").update(bytes.subarray(0, size)).digest("hex");
        return {
          currentHash,
          state: !evidence.contentHash
            ? "untracked"
            : evidence.contentHash === currentHash
              ? "current"
              : "changed",
        };
      } catch {
        return { state: "missing" };
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
      }
    },
  };
}
