// Turns what the user says or types after a set into exercises (requirements 5 to 7).
// This is the free edition's rule-based reader: it handles the common ways people
// describe sets, and anything it gets wrong is fixed with the Edit button.

export type WeightUnit = 'kg' | 'lb';
export type Technique = 'pyramid' | 'drop set';

export type ParsedSet = {
  weight: number | null; // null means bodyweight or not said
  unit: WeightUnit | null;
  reps: number | null;
  toFailure: boolean;
};

export type ParsedExercise = {
  name: string;
  sets: ParsedSet[];
  technique: Technique | null;
};

export type ParseResult =
  | { kind: 'exercises'; exercises: ParsedExercise[]; superset: boolean }
  | { kind: 'end-workout' }
  | { kind: 'not-understood'; reason: string };

export const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === 'kg' ? weight : weight * KG_PER_LB;
}

export function toLb(weight: number, unit: WeightUnit): number {
  return unit === 'lb' ? weight : weight / KG_PER_LB;
}

function trimNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// Requirement 5b: show both units, the one the user said first.
export function formatWeight(weight: number | null, unit: WeightUnit | null): string {
  if (weight === null || unit === null) return 'Bodyweight';
  const other: WeightUnit = unit === 'kg' ? 'lb' : 'kg';
  const converted = unit === 'kg' ? toLb(weight, 'kg') : toKg(weight, 'lb');
  return `${trimNumber(weight)} ${unit} (${trimNumber(converted)} ${other})`;
}

export function formatSet(set: ParsedSet): string {
  const reps = set.reps === null ? '' : `${set.reps} reps`;
  const failure = set.toFailure ? (reps ? ' to failure' : 'To failure') : '';
  const weight = set.weight === null ? '' : formatWeight(set.weight, set.unit);
  const effort = `${reps}${failure}`;
  if (weight && effort) return `${weight} × ${effort}`;
  return weight || effort || 'Set';
}

// ---------------------------------------------------------------------------
// Reading the words

export type Token =
  | { type: 'num'; value: number }
  | { type: 'unit'; unit: WeightUnit }
  | { type: 'reps' }
  | { type: 'sets' }
  | { type: 'times' }
  | { type: 'failure' }
  | { type: 'bodyweight' }
  | { type: 'technique'; technique: Technique }
  | { type: 'superset' }
  | { type: 'separator'; text: string }
  | { type: 'word'; text: string };

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const UNIT_WORDS: Record<string, WeightUnit> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kilogrammes: 'kg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
};

// Words that carry no meaning of their own in a set description.
const FILLER = new Set([
  'i', 'did', 'do', 'just', 'done', 'finished', 'now', 'ok', 'okay', 'so', 'um', 'uh',
  'for', 'of', 'at', 'each', 'per', 'a', 'an', 'the', 'my', 'with', 'and', 'then', 'plus',
  'next', 'went', 'got', 'to', 'till', 'until', 'last', 'first',
]);

// Words that join two exercises: "bench press 80 kg 10 then flies 15 kg 12".
const SEPARATORS = new Set(['and', 'with', 'then', 'next', 'followed', 'plus']);

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/(\d)\s*(kgs?|lbs?)\b/g, '$1 $2')
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1 x $2')
    .replace(/super[\s-]set/g, 'superset')
    .replace(/drop[\s-]?set/g, 'dropset')
    .replace(/body[\s-]?weight/g, 'bodyweight')
    .replace(/\b(each|per) (side|arm|leg)\b/g, ' ')
    .replace(/[^a-z0-9.\s'-]/g, ' ')
    .replace(/(^|\s)-+|-+(\s|$)/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, '').replace(/\.$/, ''))
    .filter(Boolean);
}

// Reads "twenty two and a half", "one hundred twenty" and digits from speech recognizers.
function readNumber(words: string[], start: number): { value: number; length: number } | null {
  const first = words[start];
  if (/^\d+(\.\d+)?$/.test(first)) {
    let value = Number(first);
    let length = 1;
    if (words[start + 1] === 'and' && words[start + 2] === 'a' && words[start + 3] === 'half') {
      value += 0.5;
      length += 3;
    }
    return { value, length };
  }

  let value = 0;
  let current = 0;
  let length = 0;
  let any = false;
  // What a following word may add to: "twenty two" and "one hundred twenty" combine,
  // but "twelve ten" is two numbers.
  let accepts: 'any' | 'ones' | 'none' = 'any';
  for (let i = start; i < words.length; i++) {
    const word = words[i];
    if (word in ONES && accepts !== 'none') {
      current += ONES[word];
      accepts = 'none';
    } else if (word in TENS && accepts === 'any') {
      current += TENS[word];
      accepts = 'ones';
    } else if (word === 'hundred' && any && current < 10) {
      current *= 100;
      accepts = 'any';
    } else if (word === 'and' && current >= 100 && (words[i + 1] in ONES || words[i + 1] in TENS)) {
      // "one hundred and twenty"
    } else break;
    any = true;
    length = i - start + 1;
  }
  if (!any) return null;
  value += current;
  if (words[start + length] === 'and' && words[start + length + 1] === 'a' && words[start + length + 2] === 'half') {
    value += 0.5;
    length += 3;
  }
  return { value, length };
}

export function tokenize(text: string): Token[] {
  const words = normalize(text);
  const tokens: Token[] = [];
  for (let i = 0; i < words.length; ) {
    const word = words[i];
    const number = readNumber(words, i);
    if (number && !(word === 'one' && !/^\d/.test(words[i + 1] ?? '') && isNameWord(words[i + 1]))) {
      tokens.push({ type: 'num', value: number.value });
      i += number.length;
      continue;
    }
    i += 1;
    if (word in UNIT_WORDS) tokens.push({ type: 'unit', unit: UNIT_WORDS[word] });
    else if (word === 'rep' || word === 'reps' || word === 'repetitions' || word === 'repetition')
      tokens.push({ type: 'reps' });
    else if (word === 'sets' || word === 'set' || word === 'rounds') tokens.push({ type: 'sets' });
    else if (word === 'x' || word === 'by' || word === 'times') tokens.push({ type: 'times' });
    else if (word === 'failure' || word === 'failed') tokens.push({ type: 'failure' });
    else if (word === 'bodyweight') tokens.push({ type: 'bodyweight' });
    else if (word === 'pyramid') tokens.push({ type: 'technique', technique: 'pyramid' });
    else if (word === 'dropset') tokens.push({ type: 'technique', technique: 'drop set' });
    else if (word === 'superset' || word === 'supersets') tokens.push({ type: 'superset' });
    else if (word === 'followed' && words[i] === 'by') {
      tokens.push({ type: 'separator', text: 'followed by' });
      i += 1;
    } else if (SEPARATORS.has(word)) tokens.push({ type: 'separator', text: word });
    else tokens.push({ type: 'word', text: word });
  }
  return tokens;
}

function isNameWord(word: string | undefined): boolean {
  return (
    word !== undefined &&
    !(word in UNIT_WORDS) &&
    !(word in ONES) &&
    !(word in TENS) &&
    word !== 'hundred' &&
    !['rep', 'reps', 'set', 'sets', 'x', 'by', 'times', 'and'].includes(word)
  );
}

const isNamePart = (token: Token) => token.type === 'word' && !FILLER.has(token.text);

// Splits "curls 12 kg 10 with pushdown 20 kg 12" into one segment per exercise. A joining word
// only starts a new exercise once the current one has numbers and a new name follows, so
// "clean and jerk 60 kg 5" and "12 and 10 and 8" stay whole.
export function splitExercises(tokens: Token[]): Token[][] {
  const segments: Token[][] = [[]];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const current = segments[segments.length - 1];
    if (token.type === 'separator') {
      const hasNumbers = current.some((t) => t.type === 'num' || t.type === 'failure');
      let j = i + 1;
      while (tokens[j]?.type === 'separator' || (tokens[j]?.type === 'word' && !isNamePart(tokens[j])))
        j++;
      if (hasNumbers && tokens[j] && isNamePart(tokens[j])) {
        segments.push([]);
        continue;
      }
      // Not a new exercise: keep the word, it may belong to a name ("clean and jerk").
      current.push({ type: 'word', text: token.text });
      continue;
    }
    current.push(token);
  }
  return segments.filter((segment) => segment.length > 0);
}

export function titleCase(words: string[]): string {
  return words
    .map((word) => (word.length <= 2 && word !== 'up' ? word.toUpperCase() : word))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\bPull Ups?\b/i, (m) => m.replace(' ', '-'))
    .replace(/\bPush Ups?\b/i, (m) => m.replace(' ', '-'))
    .replace(/\bChin Ups?\b/i, (m) => m.replace(' ', '-'))
    .replace(/\bSit Ups?\b/i, (m) => m.replace(' ', '-'));
}

export type SetReading = {
  sets: ParsedSet[];
  technique: Technique | null;
  // False when nothing about weight was said ("10 reps"): the sets then use the last set's weight.
  weightSaid: boolean;
  // A weight was said but no reps, "80 kg".
  weightOnly: boolean;
};

// Reads the sets in a stream of number, unit and keyword tokens. In 'set' mode (one exercise is
// already chosen) "80 for 10" and "80 x 10" without a unit mean 80 of the current unit for 10 reps.
export function readSets(stream: Token[], mode: 'log' | 'set' = 'log', defaultUnit: WeightUnit = 'kg'): SetReading {
  const sets: ParsedSet[] = [];
  let technique: Technique | null = null;
  // undefined: no weight said yet; null: bodyweight.
  let weight: { value: number; unit: WeightUnit } | null | undefined;
  let pendingCount: number | null = null;
  const waitingForWeight: ParsedSet[] = [];
  const hasUnit = stream.some((t) => t.type === 'unit' || t.type === 'bodyweight');

  const push = (reps: number | null, count = 1, toFailure = false) => {
    for (let k = 0; k < count; k++) {
      const set: ParsedSet = {
        weight: weight ? weight.value : null,
        unit: weight ? weight.unit : null,
        reps,
        toFailure,
      };
      if (weight === undefined) waitingForWeight.push(set);
      sets.push(set);
    }
  };

  const setWeight = (value: { value: number; unit: WeightUnit } | null) => {
    weight = value;
    // "3 sets of 10 at 80 kg": the weight came after the sets it belongs to.
    for (const set of waitingForWeight.splice(0)) {
      set.weight = value ? value.value : null;
      set.unit = value ? value.unit : null;
    }
  };

  for (let i = 0; i < stream.length; i++) {
    const token = stream[i];
    const next = stream[i + 1];
    const after = stream[i + 2];

    if (token.type === 'technique') technique = token.technique;
    else if (token.type === 'bodyweight') setWeight(null);
    else if (token.type === 'failure') {
      const last = sets[sets.length - 1];
      if (last && !last.toFailure && i > 0 && stream[i - 1].type !== 'unit') last.toFailure = true;
      else push(null, pendingCount ?? 1, true);
      pendingCount = null;
    } else if (token.type === 'num') {
      if (next?.type === 'unit') {
        setWeight({ value: token.value, unit: next.unit });
        i += 1;
      } else if (
        mode === 'set' &&
        !hasUnit &&
        weight === undefined &&
        next?.type === 'times' &&
        after?.type === 'num' &&
        token.value > 5
      ) {
        // "80 for 10", "80 x 10": weight then reps.
        setWeight({ value: token.value, unit: defaultUnit });
        i += 1;
      } else if (
        mode === 'set' &&
        !hasUnit &&
        weight === undefined &&
        sets.length === 0 &&
        next?.type === 'num' &&
        token.value >= 25
      ) {
        // "80 10": nobody does 80 reps, so the first number is the weight.
        setWeight({ value: token.value, unit: defaultUnit });
      } else if ((next?.type === 'times' || next?.type === 'sets') && after?.type === 'num' && stream[i + 3]?.type !== 'unit') {
        // "3 x 10", "3 sets of 10", "3 by 10"
        const failure = stream[i + 3]?.type === 'failure';
        push(after.value, token.value, failure);
        i += failure ? 3 : 2;
        if (stream[i + 1]?.type === 'reps') i += 1;
      } else if (next?.type === 'sets') {
        pendingCount = token.value;
        i += 1;
      } else {
        // A bare number, "10 reps", "10 times" or "10 to failure" is one set's reps.
        let used = 0;
        if (next?.type === 'reps' || next?.type === 'times') used = 1;
        const failure = stream[i + 1 + used]?.type === 'failure';
        push(token.value, pendingCount ?? 1, failure);
        pendingCount = null;
        i += used + (failure ? 1 : 0);
      }
    }
  }

  const weightSaid = weight !== undefined;
  const weightOnly = sets.length === 0 && weight !== undefined && weight !== null;
  if (!technique && sets.length >= 3) {
    const kg = sets.map((s) => (s.weight === null || s.unit === null ? null : toKg(s.weight, s.unit)));
    const rising = kg.every((w, k) => k === 0 || (w !== null && kg[k - 1] !== null && w > kg[k - 1]!));
    if (rising) technique = 'pyramid';
  }
  if (sets.length === 0 && weight !== undefined) push(null);
  return { sets, technique, weightSaid, weightOnly };
}

// The words of a segment that make up the exercise name. Filler words stay in a name only
// between two name words ("bench press with dumbbells").
export function nameWordsOf(segment: Token[]): string[] {
  return segment.flatMap((token, k) => {
    if (token.type !== 'word') return [];
    if (isNamePart(token)) return [token.text];
    const before = segment[k - 1];
    const after = segment[k + 1];
    return before && after && isNamePart(before) && isNamePart(after) ? [token.text] : [];
  });
}

export const setTokens = (segment: Token[]) =>
  segment.filter((t) => t.type !== 'word' && t.type !== 'separator');

function readExercise(segment: Token[]): ParsedExercise | { error: string } {
  const nameWords = nameWordsOf(segment);
  const reading = readSets(setTokens(segment));

  if (nameWords.length === 0) {
    return { error: 'Start with the exercise name, for example "bench press 80 kg 10 reps".' };
  }
  const { sets } = reading;
  if (sets.length === 0) {
    return { error: `I heard "${titleCase(nameWords)}" but no weight or reps.` };
  }

  return { name: titleCase(nameWords), sets, technique: reading.technique };
}

const END_WORKOUT = /^(please )?(end|finish|stop|close)( (the|my|this))? (workout|training|session)( now)?( please)?$/;

export function parseExerciseLog(text: string): ParseResult {
  const plain = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (END_WORKOUT.test(plain)) return { kind: 'end-workout' };
  if (!plain && !/\d/.test(text)) {
    return { kind: 'not-understood', reason: 'Nothing was heard. Try again a little closer to the phone.' };
  }

  const tokens = tokenize(text);
  const superset = tokens.some((t) => t.type === 'superset');
  const exercises: ParsedExercise[] = [];
  for (const segment of splitExercises(tokens.filter((t) => t.type !== 'superset'))) {
    const exercise = readExercise(segment);
    if ('error' in exercise) return { kind: 'not-understood', reason: exercise.error };
    exercises.push(exercise);
  }
  if (exercises.length === 0) {
    return { kind: 'not-understood', reason: 'Start with the exercise name, for example "bench press 80 kg 10 reps".' };
  }
  return { kind: 'exercises', exercises, superset: superset && exercises.length > 1 };
}

// ---------------------------------------------------------------------------
// Set times (requirement 6b)

export type TimedSet = { exerciseIndex: number; setIndex: number; startedAt: string; endedAt: string };

const MIN_SET_MS = 20_000;
const MAX_SET_MS = 90_000;
const MS_PER_REP = 4_000;

export function estimatedSetMs(reps: number | null): number {
  if (reps === null) return 45_000;
  return Math.min(MAX_SET_MS, Math.max(MIN_SET_MS, reps * MS_PER_REP));
}

// The user speaks after training, so set times are estimated: the sets said in one recording
// are spread evenly between the previous set (or the workout start) and the moment they spoke,
// each ending at its slot and lasting about 4 seconds per rep. Supersets alternate exercises.
export function estimateSetTimes(
  exercises: ParsedExercise[],
  superset: boolean,
  windowStart: Date,
  spokenAt: Date,
): TimedSet[] {
  const order: { exerciseIndex: number; setIndex: number; reps: number | null }[] = [];
  if (superset) {
    const rounds = Math.max(...exercises.map((e) => e.sets.length));
    for (let round = 0; round < rounds; round++) {
      exercises.forEach((exercise, exerciseIndex) => {
        const set = exercise.sets[round];
        if (set) order.push({ exerciseIndex, setIndex: round, reps: set.reps });
      });
    }
  } else {
    exercises.forEach((exercise, exerciseIndex) =>
      exercise.sets.forEach((set, setIndex) => order.push({ exerciseIndex, setIndex, reps: set.reps })),
    );
  }

  const end = spokenAt.getTime();
  const start = Math.min(windowStart.getTime(), end);
  const slot = order.length > 0 ? (end - start) / order.length : 0;
  let previousEnd = start;
  return order.map((item, k) => {
    const endedAt = order.length === 1 ? end : Math.round(start + slot * (k + 1));
    const startedAt = Math.max(previousEnd, endedAt - estimatedSetMs(item.reps));
    previousEnd = endedAt;
    return {
      exerciseIndex: item.exerciseIndex,
      setIndex: item.setIndex,
      startedAt: new Date(Math.min(startedAt, endedAt)).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Saved exercises

export type LoggedSet = ParsedSet & {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type LoggedExercise = {
  id: string;
  workoutId: string;
  name: string;
  technique: Technique | null;
  supersetGroup: string | null;
  spokenText: string | null;
  muscle: string | null;
  createdAt: string;
  // null while the trainer is still doing this exercise.
  finishedAt: string | null;
  sets: LoggedSet[];
};
