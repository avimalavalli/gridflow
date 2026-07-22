import { afterEach, describe, expect, it } from "vitest";
import { currentReleaseCommit, currentReleaseVersion, releaseMetadataConfigured } from "../src/release-metadata.js";

const original = {
  version: process.env.GRIDFLOW_RELEASE,
  commit: process.env.GRIDFLOW_COMMIT_SHA,
  railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA,
};

afterEach(() => {
  if (original.version === undefined) delete process.env.GRIDFLOW_RELEASE; else process.env.GRIDFLOW_RELEASE = original.version;
  if (original.commit === undefined) delete process.env.GRIDFLOW_COMMIT_SHA; else process.env.GRIDFLOW_COMMIT_SHA = original.commit;
  if (original.railwayCommit === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA; else process.env.RAILWAY_GIT_COMMIT_SHA = original.railwayCommit;
});

describe("release metadata", () => {
  it("prefers Railway's immutable deployment commit over a manually pinned value", () => {
    process.env.GRIDFLOW_RELEASE = "v1.0.0";
    process.env.GRIDFLOW_COMMIT_SHA = "old-manual-commit";
    process.env.RAILWAY_GIT_COMMIT_SHA = "current-railway-commit";

    expect(currentReleaseVersion()).toBe("v1.0.0");
    expect(currentReleaseCommit()).toBe("current-railway-commit");
    expect(releaseMetadataConfigured()).toBe(true);
  });

  it("falls back to explicit metadata outside Railway", () => {
    process.env.GRIDFLOW_RELEASE = "v1.0.0-local";
    process.env.GRIDFLOW_COMMIT_SHA = "local-commit";
    delete process.env.RAILWAY_GIT_COMMIT_SHA;

    expect(currentReleaseVersion()).toBe("v1.0.0-local");
    expect(currentReleaseCommit()).toBe("local-commit");
  });
});
