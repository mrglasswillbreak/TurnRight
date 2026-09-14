/** Let model ray-picking and the ground editor adapter share one click safely. */
const selectedModelEvents = new WeakSet<Event>();
export const markModelSelection = (event: Event) =>
  selectedModelEvents.add(event);
export const hasModelSelection = (event: Event) =>
  selectedModelEvents.has(event);
