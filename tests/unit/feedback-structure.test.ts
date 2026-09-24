import { describe, expect, it } from 'vitest';
import { StructuredFeedbackSchema } from '../../src/schemas/feedback.js';

describe('structured feedback', () => {
  it('requires a regression case so human judgement becomes reusable factory data', () => {
    expect(() => StructuredFeedbackSchema.parse({ project: 'g', artifact_version: 'v1', rejected_dimension: 'feel', reason: 'drop is unnatural', before: 'objects snap', after: 'objects arc', accepted_result: 'natural drop', new_regression_case: '' })).toThrow();
    expect(StructuredFeedbackSchema.parse({ project: 'g', artifact_version: 'v1', rejected_dimension: 'feel', reason: 'drop is unnatural', before: 'objects snap', after: 'objects arc', accepted_result: 'natural drop', new_regression_case: 'three objects at varied angles retain momentum' }).new_regression_case).toContain('three');
  });
});
