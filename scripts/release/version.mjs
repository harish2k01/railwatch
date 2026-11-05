export const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function bumpLabel(labels) {
  const selected = labels
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((label) => ["major", "minor", "patch"].includes(label));
  if (selected.length !== 1)
    throw new Error("Add exactly one release label: major, minor, or patch.");
  return selected[0];
}
export function nextVersion(previous, bump) {
  if (!VERSION.test(previous)) throw new Error("Invalid stable release tag");
  if (!["major", "minor", "patch"].includes(bump))
    throw new Error("Invalid version bump");
  let [major, minor, patch] = previous.slice(1).split(".").map(Number);
  if (bump === "major") {
    major++;
    minor = 0;
    patch = 0;
  }
  if (bump === "minor") {
    minor++;
    patch = 0;
  }
  if (bump === "patch") patch++;
  return `v${major}.${minor}.${patch}`;
}
export function compareVersions(a, b) {
  const aa = a.slice(1).split(".").map(Number),
    bb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return 0;
}

// Commits must be in oldest-first, first-parent order after the last release.
export function planVersions(previous, commits) {
  let tag = previous;
  const plans = [];
  for (const { sha, prs } of commits) {
    const pr = prs.find(
      (p) => p.merged_at && p.base.ref === "main" && p.merge_commit_sha === sha,
    );
    if (!pr) continue;
    const bump = bumpLabel(pr.labels);
    tag = nextVersion(tag, bump);
    plans.push({ tag, sha, pr: pr.number, bump });
  }
  return plans;
}

// Only the newest release is deployed, so a batch builds one image: the highest version.
// Older releases in the batch keep their tag and notes but are marked superseded.
export function newestTarget(targets) {
  return targets.length ? [[...targets].sort((a, b) => compareVersions(a.tag, b.tag)).at(-1)] : [];
}
export const SUPERSEDED = "Superseded by a newer release in the same batch; no separate image was built.";
