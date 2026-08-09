// Les décisions que l'écran des templates prend autour d'un enregistrement,
// sorties du composant pour être testables. Pur : ni React, ni réseau.
//
// Trois règles y vivent, chacune née d'un défaut réel :
//
//   1. Un brouillon qui a bougé PENDANT la requête reste sale. Le drapeau
//      « sale » est ce qui protège une langue d'être écrasée par le
//      rechargement ; l'effacer alors que le texte a changé depuis l'envoi
//      rend les frappes suivantes au rechargement, qui les remplace par ce
//      qui a été envoyé. La zone de saisie revient en arrière, sans un mot.
//   2. L'échec du RECHARGEMENT n'est pas l'échec de l'ENREGISTREMENT. Côté
//      serveur, la branche 200 est inatteignable si le texte n'a pas été
//      écrit : c'est une garantie construite exprès. La jeter parce que le GET
//      de rafraîchissement a hoqueté afficherait « échec » en rouge sur un
//      texte pourtant en base, et le staff retaperait ce qui est déjà
//      enregistré.
//   3. Une traduction ratée est un AVERTISSEMENT. La langue saisie est bien
//      écrite ; seules les langues dérivées manquent.

export type StatusTone = 'success' | 'warning' | 'danger';

export interface DraftStatus {
  tone: StatusTone;
  text: string;
}

export interface SaveOutcome {
  /**
   * Si le drapeau « sale » de cette langue peut être effacé, c'est-à-dire si
   * le brouillon à l'écran vaut toujours exactement ce qui a été envoyé.
   */
  clearDirty: boolean;
  status: DraftStatus;
}

export interface SaveFlowDeps<R> {
  /** Le corps réellement envoyé au serveur, figé au moment de l'envoi. */
  sent: string;
  /** L'écriture. Une exception ici, et seulement ici, est un échec d'enregistrement. */
  save: () => Promise<R>;
  /** Le brouillon tel qu'il est MAINTENANT, lu après la résolution de `save`. */
  currentDraft: () => string;
  /** Si le résultat signale que les langues dérivées n'ont pas pu être générées. */
  translationFailed: (result: R) => boolean;
  labels: { saved: string; translateFailed: string };
  /** Applique le résultat à l'écran. Appelé avant tout rechargement. */
  commit: (outcome: SaveOutcome) => void;
  /** Le rafraîchissement qui suit. Son échec ne peut plus rien changer. */
  reload: () => Promise<void>;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Enchaîne l'enregistrement puis le rechargement, en garantissant que ce que
 * l'écran affiche est décidé par le seul résultat de l'ENREGISTREMENT.
 *
 * L'ordre est structurel, pas cosmétique : `commit` est appelé avant que
 * `reload` soit attendu, si bien qu'aucune défaillance du rechargement ne peut
 * se substituer au verdict de l'écriture. `commit` porte aussi `clearDirty`
 * parce que le rechargement lit ce drapeau : il doit être à jour avant, jamais
 * après.
 *
 * Ne rejette jamais : tout est rapporté par `commit`.
 */
export async function runSaveFlow<R>(deps: SaveFlowDeps<R>): Promise<void> {
  let result: R;
  try {
    result = await deps.save();
  } catch (e) {
    // Rien n'a été écrit : le brouillon reste du travail non enregistré.
    deps.commit({ clearDirty: false, status: { tone: 'danger', text: errorText(e) } });
    return;
  }

  deps.commit({
    clearDirty: deps.currentDraft() === deps.sent,
    status: deps.translationFailed(result)
      ? { tone: 'warning', text: deps.labels.translateFailed }
      : { tone: 'success', text: deps.labels.saved },
  });

  try {
    await deps.reload();
  } catch {
    // Le texte EST enregistré. L'écran a simplement un rafraîchissement de
    // retard : la prochaine interaction le rattrape. Le signaler en rouge
    // ferait croire à une perte qui n'a pas eu lieu.
  }
}

/**
 * Si cette langue porte du travail non enregistré.
 *
 * La référence est ce que le serveur détient : la personnalisation du
 * restaurant si elle existe, sinon le défaut livré par le registre — sans
 * personnalisation, le défaut EST le texte que le client reçoit, et un onglet
 * jamais touché ne doit rien réclamer.
 */
export function hasUnsavedDraft(
  draft: string,
  row: { body: string } | undefined,
  registryDefault: string,
): boolean {
  return draft !== (row?.body ?? registryDefault);
}
