/** Synthetic contract data for engineering tests; never player-experience evidence. */
export function referenceBehaviorChecks(source: { path: string; sha256: string }) {
  return (['input_state', 'spatial_relation', 'failure_recovery', 'feedback_sequence', 'terminal_replay'] as const).map((dimension) => ({
    id: `reference-${dimension}`,
    dimension,
    sourceRefs: [{ path: source.path, sha256: source.sha256, locator: `synthetic fixture: ${dimension}` }],
    objectType: 'target',
    stateBranch: dimension,
    playerInput: 'Tap the visible target, then the replay control after settlement.',
    expectedStateChange: `${dimension}: the target resolves and the next choice becomes available`,
    spatialRelationship: 'The feedback remains attached to the target it describes.',
    visibleFeedback: { anchor: 'resolved target', eventOrder: ['contact', 'resolution', 'local reward', 'total update'] },
    viewport: { width: 390, height: 844 },
  }));
}

/** Synthetic source-bound pressure contract for research pipeline tests. */
export function referenceFailurePressureContract(source: { path: string; sha256: string }) {
  return {
    schemaVersion: 1 as const,
    purpose: 'Record how the reference creates, signals, escalates, attributes, and recovers from failure pressure.',
    evidence: [{
      id: 'reference-hazard-pressure',
      competitor: 'Reference',
      sourceRefs: [source.path],
      observed: ['A visible hazard contact ends the active attempt.'],
      inferred: ['The approach trajectory gives the player a timing decision before contact.'],
      applicability: 'adapt' as const,
      applicabilityRationale: 'Preserve the causal pressure relationship with original expression and tuning.',
      rejectExpression: ['names', 'assets', 'UI layout', 'audio', 'numeric tuning'],
      confidence: 'high' as const,
    }],
    rules: [{
      id: 'reference-hazard-rule',
      pressureType: 'hazard' as const,
      trigger: 'The controllable object reaches the visible hazard.',
      playerSignal: 'The hazard remains visible before contact and reacts at impact.',
      escalation: 'Forward motion reduces the remaining safe timing window.',
      failureOutcome: 'The current attempt enters an attributable failed state.',
      attribution: 'Impact feedback stays anchored to the hazard and controllable object.',
      recovery: 'A visible retry action restores the initial ready state.',
      sourceEvidenceRefs: ['reference-hazard-pressure'],
      implementationImplications: ['Keep the hazard visible before contact.', 'Expose one natural-input retry path.'],
    }],
    noCopyBoundary: ['Do not copy third-party names, assets, UI layout, audio, content, or numeric tuning.'],
  };
}
