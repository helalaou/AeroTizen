const DESCRIPTION_SUFFIX = / - .*/;
const GENERATION_SUFFIX = /NextGeneration$/;

export const shortAppName = (name: string) => name.replace(DESCRIPTION_SUFFIX, "").replace(GENERATION_SUFFIX, "");

export const artworkAlias = (name: string) => name.toLowerCase().replace(DESCRIPTION_SUFFIX, "").trim();
