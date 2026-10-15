// The original natural-journey recorder writes a runtime string, while newer
// recorders also expose engine. Preserve raw bytes and require agreement.
export function matchesBrowserIdentity(report, engine) {
 return ['webkit','chromium'].includes(engine)
  && report?.runtime === engine+' desktop touch emulation; not physical mobile'
  && (report.engine === undefined || report.engine === engine)
  && report.normalInputOnly === true && report.stateInjection === false;
}
