import pkg from "../package.json";

/** Reported with every batch so the ingest side can flag outdated apps. */
export const SDK_VERSION: string = pkg.version;
