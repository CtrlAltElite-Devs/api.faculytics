export const INTERPRETATION_SCALE = [
  { min: 4.5, max: 5.0, label: 'EXCELLENT PERFORMANCE' },
  { min: 3.5, max: 4.49, label: 'VERY SATISFACTORY PERFORMANCE' },
  { min: 2.5, max: 3.49, label: 'SATISFACTORY PERFORMANCE' },
  { min: 1.5, max: 2.49, label: 'FAIR PERFORMANCE' },
  { min: 1.0, max: 1.49, label: 'NEEDS IMPROVEMENT' },
] as const;

export function getInterpretation(average: number): string {
  const clamped = Math.max(1.0, Math.min(5.0, average));

  for (const tier of INTERPRETATION_SCALE) {
    if (clamped >= tier.min && clamped <= tier.max) {
      return tier.label;
    }
  }

  return INTERPRETATION_SCALE[INTERPRETATION_SCALE.length - 1].label;
}
