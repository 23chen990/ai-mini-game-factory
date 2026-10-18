/** QA-only: use the full installed Chromium in its new headless mode.
 * No game, clock, viewport, input, timeout or GPU flag changes. Explicit
 * channels/executables and headed launches remain authoritative.
 * Primary source: https://playwright.dev/docs/browsers#chromium-new-headless-mode
 */
export function realRacingChromiumOptions(options = {}) {
  if(options.channel || options.executablePath || options.headless === false)return options;
  return {...options,channel:'chromium'};
}
