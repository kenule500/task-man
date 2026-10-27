// One-off governance operation approved on 2026-10-19: approve the implementation and review gates
// using the project's gates module (which now enforces CON-614). The globally installed `sdrive`
// binary bundles its own, older copy of gates.js, so `sdrive approve` still refuses; this script calls
// the same check + approveGate functions from the project module instead of hand-editing the state.
const gates = require("../../commands/gates.js");

const root = process.cwd();
const featureName = "real-time-chat";

for (const gate of ["implementation", "review"]) {
  const state = gates.getWorkflowState();
  const feature = gates.findFeature(state, featureName);
  const version = gates.resolveVersion(feature);
  const check = gates.checkGateRequirements(root, feature, version, gate);

  console.log(`\n${gate}: ${check.ok ? "ok" : "blocked"}`);
  check.warnings.forEach((warning) => console.log(`  warning: ${warning}`));
  check.blockers.forEach((blocker) => console.log(`  blocker: ${blocker}`));

  if (!check.ok) process.exit(1);
  if (gates.isGateApprovedFor(version, gate)) {
    console.log("  already approved");
    continue;
  }
  if (!gates.approveGate(featureName, gate)) process.exit(1);
}
