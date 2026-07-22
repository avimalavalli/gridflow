function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function currentReleaseVersion(): string {
  return clean(process.env.GRIDFLOW_RELEASE) ?? "v1-release-candidate";
}

export function currentReleaseCommit(): string | null {
  return clean(process.env.RAILWAY_GIT_COMMIT_SHA) ?? clean(process.env.GRIDFLOW_COMMIT_SHA);
}

export function releaseMetadataConfigured(): boolean {
  return Boolean(clean(process.env.GRIDFLOW_RELEASE) && currentReleaseCommit());
}
