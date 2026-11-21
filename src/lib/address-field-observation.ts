export type AddressChoiceOutcome = 'first' | 'later' | 'manual';
export type AddressFieldEvent = 'first_choice' | 'first_choice_ok' | 'selection_ok' | 'search_blocked' | 'search_recovered' | 'manual_ok';

/** Counts visible outcomes within one mounted field. The observer receives no input text or identifier. */
export function addressFieldObservation(until: string | undefined, emit: (event: AddressFieldEvent) => void) {
  const end = until ? Date.parse(until) : 0;
  const active = () => Number.isFinite(end) && Date.now() < end;
  let choices = 0;
  let blocked = false;
  function available(usable: boolean) {
    const nextBlocked = !usable;
    if (!active() || blocked === nextBlocked) return;
    blocked = nextBlocked;
    emit(usable ? 'search_recovered' : 'search_blocked');
  }
  return {
    available,
    choose() {
      if (!active()) return;
      choices += 1;
      if (choices === 1) emit('first_choice');
    },
    accept(manual = false): AddressChoiceOutcome | undefined {
      if (!active() || (!manual && !choices)) return;
      available(true);
      const outcome = manual ? 'manual' : choices === 1 ? 'first' : 'later';
      if (outcome === 'first') emit('first_choice_ok');
      emit(manual ? 'manual_ok' : 'selection_ok');
      choices = 0;
      return outcome;
    },
  };
}
