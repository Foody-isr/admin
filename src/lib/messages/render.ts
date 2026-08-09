// Moteur de rendu des templates de message. Pur : ni React, ni réseau, ni horloge.
//
// Deux règles portent l'essentiel du comportement visible :
//   - un jeton inconnu rend une chaîne vide, jamais `{{jeton}}`, parce qu'un
//     client ne doit jamais recevoir un message contenant des accolades ;
//   - une ligne dont TOUS les jetons DÉCLARÉS rendent du vide disparaît
//     entièrement, pour qu'une commande à emporter n'affiche pas un
//     « 📍 Adresse : » nu.
//
// Ces deux règles ne portent pas sur les mêmes jetons : un jeton inconnu (une
// coquille, un nom que le contexte n'a jamais entendu parler) ne doit jamais
// faire disparaître une ligne à lui seul, il s'efface simplement sur place.
// Seul un jeton déclaré par le contexte, ne serait-ce qu'avec une valeur
// vide, ("cette commande n'a pas d'adresse") compte dans la décision de
// suppression de la ligne.

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export interface RenderContext {
  /** Valeurs simples : nom du client, numéro de commande, lien de suivi. */
  tokens: Record<string, string>;
  /** Blocs composés par Foody : liste d'articles, totaux, adresse. */
  blocks: Record<string, string>;
}

function hasKey(record: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, name);
}

export function renderTemplate(body: string, ctx: RenderContext): string {
  const kept: string[] = [];

  for (const line of body.split('\n')) {
    let tokenCount = 0;
    let emptyCount = 0;

    const rendered = line.replace(TOKEN_RE, (_match, name: string) => {
      // Un bloc gagne sur un jeton simple de même nom : le contenu généré est
      // toujours la réponse la plus riche.
      const declared = hasKey(ctx.blocks, name) || hasKey(ctx.tokens, name);
      const value = ctx.blocks[name] ?? ctx.tokens[name] ?? '';

      if (declared) {
        tokenCount += 1;
        if (value === '') emptyCount += 1;
      }

      return value;
    });

    if (tokenCount > 0 && tokenCount === emptyCount) continue;
    kept.push(rendered);
  }

  return kept.join('\n');
}

/** Les noms de jetons présents dans un corps, chacun une seule fois. */
export function tokensUsed(body: string): string[] {
  const seen = new Set<string>();
  for (const match of Array.from(body.matchAll(TOKEN_RE))) seen.add(match[1]);
  return Array.from(seen);
}
