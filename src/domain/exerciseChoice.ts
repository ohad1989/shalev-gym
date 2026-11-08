// Reads what the trainer says to choose the next exercise: "bench press", "next is squats",
// "curls superset with pushdowns", or a name with its first set, "bench press 80 kg 10".

import { cleanSpokenName, matchExercise, type ExerciseMatch } from './exerciseCatalog';
import {
  nameWordsOf,
  readSets,
  setTokens,
  titleCase,
  tokenize,
  type ParsedSet,
  type Technique,
  type Token,
} from './exerciseLog';

export type ChosenPart = {
  match: ExerciseMatch;
  // The name to use when the trainer keeps what they said instead of a known exercise.
  spokenName: string;
  sets: ParsedSet[];
  technique: Technique | null;
};

export type ExerciseChoice =
  | { kind: 'choice'; parts: ChosenPart[]; superset: boolean }
  | { kind: 'end-workout' }
  | { kind: 'not-understood'; reason: string };

const END_WORKOUT = /^(please )?(end|finish|stop|close)( (the|my|this))? (workout|training|session)( now)?( please)?$/;

// Splits "curls superset with pushdowns" into one segment per exercise.
function splitSuperset(tokens: Token[]): Token[][] {
  const segments: Token[][] = [[]];
  for (const token of tokens) {
    const current = segments[segments.length - 1];
    const hasName = nameWordsOf(current).length > 0;
    if ((token.type === 'separator' || token.type === 'superset') && hasName) {
      segments.push([]);
      continue;
    }
    if (token.type === 'superset') continue;
    current.push(token);
  }
  return segments.filter((segment) => nameWordsOf(segment).length > 0);
}

export function parseExerciseChoice(text: string, history: string[] = []): ExerciseChoice {
  const plain = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (END_WORKOUT.test(plain)) return { kind: 'end-workout' };

  const tokens = tokenize(cleanSpokenName(text));
  const superset = tokens.some((t) => t.type === 'superset');
  const segments = superset ? splitSuperset(tokens) : [tokens];

  const parts: ChosenPart[] = [];
  for (const segment of segments) {
    const words = nameWordsOf(segment).filter((w) => !['exercise', 'please', 'is'].includes(w));
    if (words.length === 0) continue;
    const reading = readSets(setTokens(segment));
    parts.push({
      match: matchExercise(words.join(' '), history),
      spokenName: titleCase(words),
      sets: reading.weightOnly ? [] : reading.sets,
      technique: reading.technique,
    });
  }

  if (parts.length === 0) {
    return { kind: 'not-understood', reason: 'Say the exercise name, for example “bench press”.' };
  }
  return { kind: 'choice', parts, superset: superset && parts.length > 1 };
}
