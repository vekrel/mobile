import { describe, expect, it } from "vite-plus/test";

import {
  beginProjectFaviconRequest,
  createProjectFaviconRequest,
  hasLoadedProjectFavicon,
  markProjectFaviconFailed,
  markProjectFaviconLoaded,
} from "./projectFaviconRequests";

describe("project favicon requests", () => {
  it("ignores callbacks from a superseded URL", () => {
    const cacheKey = "machine-1:/workspace:v1-favicon.svg";
    const expiredUrl = "https://machine.example/api/assets/expired/v1-favicon.svg";
    const refreshedUrl = "https://machine.example/api/assets/refreshed/v1-favicon.svg";

    const expiredRequest = createProjectFaviconRequest(cacheKey, expiredUrl);
    const endExpiredRequest = beginProjectFaviconRequest(expiredRequest);
    markProjectFaviconLoaded(expiredRequest);
    const refreshedRequest = createProjectFaviconRequest(cacheKey, refreshedUrl);
    const endRefreshedRequest = beginProjectFaviconRequest(refreshedRequest);

    expect(markProjectFaviconLoaded(expiredRequest)).toBe(false);
    expect(markProjectFaviconFailed(expiredRequest)).toBe(false);
    expect(hasLoadedProjectFavicon(cacheKey)).toBe(true);
    expect(markProjectFaviconFailed(refreshedRequest)).toBe(true);
    expect(hasLoadedProjectFavicon(cacheKey)).toBe(false);

    endRefreshedRequest();
    endExpiredRequest();
  });

  it("does not supersede a request until the next request begins", () => {
    const cacheKey = "machine-1:/workspace:v3-favicon.svg";
    const committedUrl = "https://machine.example/api/assets/current/v3-favicon.svg";
    const abandonedUrl = "https://machine.example/api/assets/abandoned/v3-favicon.svg";
    const committedRequest = createProjectFaviconRequest(cacheKey, committedUrl);
    const endCommittedRequest = beginProjectFaviconRequest(committedRequest);

    createProjectFaviconRequest(cacheKey, abandonedUrl);

    expect(markProjectFaviconLoaded(committedRequest)).toBe(true);
    expect(hasLoadedProjectFavicon(cacheKey)).toBe(true);

    endCommittedRequest();
  });

  it("restores the remaining active URL when a newer request ends", () => {
    const cacheKey = "machine-1:/workspace:v4-favicon.svg";
    const firstRequest = createProjectFaviconRequest(
      cacheKey,
      "https://machine.example/api/assets/first/v4-favicon.svg",
    );
    const secondRequest = createProjectFaviconRequest(
      cacheKey,
      "https://machine.example/api/assets/second/v4-favicon.svg",
    );
    const endFirstRequest = beginProjectFaviconRequest(firstRequest);
    const endSecondRequest = beginProjectFaviconRequest(secondRequest);

    expect(markProjectFaviconLoaded(firstRequest)).toBe(false);
    endSecondRequest();
    expect(markProjectFaviconLoaded(firstRequest)).toBe(true);
    endFirstRequest();
    expect(markProjectFaviconLoaded(firstRequest)).toBe(false);
  });

  it("bounds remembered loaded revisions", () => {
    const firstCacheKey = "machine-1:/workspace:revision-0";
    let lastCacheKey = firstCacheKey;

    for (let revision = 0; revision < 300; revision++) {
      lastCacheKey = `machine-1:/workspace:revision-${revision}`;
      const request = createProjectFaviconRequest(
        lastCacheKey,
        `https://machine.example/api/assets/revision-${revision}/favicon.svg`,
      );
      const endRequest = beginProjectFaviconRequest(request);
      markProjectFaviconLoaded(request);
      endRequest();
    }

    expect(hasLoadedProjectFavicon(firstCacheKey)).toBe(false);
    expect(hasLoadedProjectFavicon(lastCacheKey)).toBe(true);
  });
});
