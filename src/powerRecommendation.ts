import { getEffectiveTargetTemperature, getRecentTemperatures } from "./db";

/**
 * Power socket recommendation: should the heating (or cooling) device be on or off?
 * Based on last indoor temperature vs desired target.
 *
 * Returns 1 = "on" when we are below target (heating should run).
 * Returns 0 = "off" when we are at or above target.
 * Returns null when there is no recent temperature reading (caller should handle appropriately).
 *
 * Isolated so additional logic (hysteresis, min on/off time, etc.) can be added later.
 */
export function getPowerSocketRecommendation(now: Date = new Date()): 0 | 1 | null {
  const latest = getRecentTemperatures(1)[0] ?? null;
  if (!latest) {
    return null;
  }

  const effective = getEffectiveTargetTemperature(now);
  const currentTemp = latest.temperature;
  const targetTemp = effective.temperature;

  if (currentTemp >= targetTemp) {
    return 0; // off – at or above target
  }
  return 1; // on – below target
}
