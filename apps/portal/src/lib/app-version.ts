export function currentAppVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim()
    || process.env.GITHUB_SHA?.trim()
    || "development";
}
