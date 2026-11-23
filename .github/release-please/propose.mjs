import { GitHub } from "release-please";
import { releaseManifest } from "./release-manifest.mjs";

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const targetBranch = "main";
const github = await GitHub.create({ owner, repo, defaultBranch: targetBranch, token: process.env.GH_TOKEN });
const manifest = await releaseManifest(github, targetBranch);
await manifest.createPullRequests();
