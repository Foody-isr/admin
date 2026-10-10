export interface FloorPlanHistory<T> { present: T; past: T[]; future: T[]; gesture?: T }
export type FloorPlanHistoryAction<T> =
  | { type: 'reset'; value: T }
  | { type: 'update'; update: (current: T) => T }
  | { type: 'begin' | 'end' | 'undo' | 'redo' };

/** Records complete layouts; a drag, resize or rotation is one undoable edit. */
export function floorPlanHistoryReducer<T>(state: FloorPlanHistory<T>, action: FloorPlanHistoryAction<T>): FloorPlanHistory<T> {
  switch (action.type) {
    case 'reset': return { present: action.value, past: [], future: [] };
    case 'begin': return state.gesture ? state : { ...state, gesture: state.present };
    case 'end': {
      if (!state.gesture) return state;
      const { gesture, ...rest } = state;
      return JSON.stringify(gesture) === JSON.stringify(state.present) ? rest : { ...rest, past: [...state.past.slice(-49), gesture], future: [] };
    }
    case 'update': {
      const present = action.update(state.present);
      if (JSON.stringify(present) === JSON.stringify(state.present)) return state;
      return { ...state, present, past: state.gesture ? state.past : [...state.past.slice(-49), state.present], future: [] };
    }
    case 'undo': {
      const target = state.past.at(-1);
      return target ? { present: target, past: state.past.slice(0,-1), future: [state.present, ...state.future] } : state;
    }
    case 'redo': {
      const target = state.future[0];
      return target ? { present: target, past: [...state.past, state.present], future: state.future.slice(1) } : state;
    }
  }
}
