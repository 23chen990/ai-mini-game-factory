/* global console, process */
/**
 * V11 defaults to native player-input/physics regression checks.
 * The historical V3–V10 pace/lane comparison remains explicitly opt-in;
 * its spline AICar timings are not comparable with V11 PlayerCar rivals.
 */
if (process.argv.includes('--legacy-v10')) {
  await import('./racing-native-player-legacy-qa.mjs');
} else {
  const { runV11NativePlayerQa } = await import('./racing-native-player-v11-qa.mjs');
  const result = await runV11NativePlayerQa();
  console.log(JSON.stringify({ status:result.status,buildHash:result.buildHash,
    checks:result.checks.length,failed:result.checks.filter(check=>check.status!=='PASS'),
    artifact:result.artifact,naturalInputsOnly:false }));
  if(result.status!=='PASS')process.exitCode=1;
}
