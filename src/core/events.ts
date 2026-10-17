// Minimal typed-ish event bus for loose coupling between modules.
//
// Known events (payload):
//   'hour' (hour:number)            clock passed a full hour
//   'day' (day:number)              new day
//   'lights' (on:boolean)           streetlights switched
//   'timejump' (hours:number)       user jumped the clock
//   'quality' (q:QualityState)      quality settings changed
//   'train:arrive' ({station:number, trainId:number})
//   'train:depart' ({station:number, trainId:number})
//   'crossing' ({id:number, closed:boolean})
//   'bus:stop' ({stopId:number, busId:number, phase:'arrive'|'depart'})
//   'camera:follow' (hit:PickHit|null)
//   'select' (hit:PickHit|null)

type Handler = (payload: any) => void;

export class EventBus {
  private map = new Map<string, Set<Handler>>();

  on(name: string, fn: Handler): () => void {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(name: string, payload?: unknown): void {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${name}" failed`, err);
      }
    }
  }
}
