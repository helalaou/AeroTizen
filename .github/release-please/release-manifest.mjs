import { Manifest, registerPlugin } from "release-please";
import { ManifestPlugin } from "release-please/build/src/plugin.js";

const DESKTOP_SCOPE = "desktop";
const PLUGIN_NAME = "exclude-desktop";

class ExcludeDesktop extends ManifestPlugin {
  processCommits(commits) {
    return commits.filter((commit) => commit.scope?.toLowerCase() !== DESKTOP_SCOPE);
  }
}

registerPlugin(PLUGIN_NAME, ({ github, targetBranch, repositoryConfig }) => {
  return new ExcludeDesktop(github, targetBranch, repositoryConfig);
});

export function releaseManifest(github, branch) {
  return Manifest.fromManifest(github, branch, undefined, undefined, { plugins: [PLUGIN_NAME] });
}
