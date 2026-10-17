/* global console */
/** Explicit Node --import QA entrypoint, never included in the H5 build.
 * Tests retain their exact inputs/assertions and run on the installed complete
 * browser instead of the separate headless-shell binary. No page injection.
 */
import {chromium} from '@playwright/test';
import {realRacingChromiumOptions} from './racing-browser-config.mjs';
const nativeLaunch=chromium.launch.bind(chromium);
chromium.launch=options=>nativeLaunch(realRacingChromiumOptions(options));
console.log('RACING_QA_BROWSER=complete-chromium; game-state-and-timing-unchanged');
