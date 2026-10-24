/**
 * Whether a launch argument turns a switch on: iOS hands `-Name true` (or
 * YES, or 1) to the app's user defaults as a string or a boolean, and
 * React Native's Settings reads it back. Maestro passes an unquoted YAML
 * boolean in a form iOS doesn't read, so flows quote it ("true").
 */
export function launchFlagOn(value: unknown): boolean {
  return (
    value === true || value === 1 || (typeof value === 'string' && /^(true|yes|1)$/i.test(value))
  );
}
