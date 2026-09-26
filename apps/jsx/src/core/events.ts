/**
 * JSX -> panel progress events over the CEP bus via PlugPlugExternalObject
 * (docs/02 §2.3 step 2). Feature-detected: when absent (or in tests), the
 * sink is null and the env reports eventsAvailable=false.
 */
export type EventSink = (type: string, payloadJson: string) => void;

export function createPlugPlugEventSink(): EventSink | null {
  if (typeof ExternalObject === "undefined") return null;
  if (typeof CSXSEvent === "undefined") return null;
  let pp: ExternalObject | null = null;
  try {
    pp = new ExternalObject("lib:\\PlugPlugExternalObject");
  } catch (e) {
    return null;
  }
  const external = pp;
  return function (type: string, payloadJson: string): void {
    try {
      const event = new CSXSEvent();
      event.type = type;
      event.data = payloadJson;
      external.dispatchEvent(event);
    } catch (e) {
      // Progress events are best-effort; failures must never break a task.
    }
  };
}
