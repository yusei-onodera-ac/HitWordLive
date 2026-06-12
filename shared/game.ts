export type GuessResult = {
  hits: number;
  blows: number;
};

const HIRAGANA_RE = /^[ぁ-んー]+$/u;

export function isValidHiraganaAnswer(value: string, expectedLength: number): boolean {
  return HIRAGANA_RE.test(value) && [...value].length === expectedLength;
}

export function calculateHitAndBlow(answer: string, guess: string): GuessResult {
  const answerChars = [...answer];
  const guessChars = [...guess];
  let hits = 0;
  const answerRest: string[] = [];
  const guessRest: string[] = [];

  for (let i = 0; i < answerChars.length; i += 1) {
    if (answerChars[i] === guessChars[i]) {
      hits += 1;
    } else {
      answerRest.push(answerChars[i]);
      guessRest.push(guessChars[i]);
    }
  }

  const counts = new Map<string, number>();
  for (const char of answerRest) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  let blows = 0;
  for (const char of guessRest) {
    const remaining = counts.get(char) ?? 0;
    if (remaining > 0) {
      blows += 1;
      counts.set(char, remaining - 1);
    }
  }

  return { hits, blows };
}

export function pointForAnswerCount(validAnswerCount: number): number {
  if (validAnswerCount <= 5) return 3;
  if (validAnswerCount <= 10) return 2;
  return 1;
}

export function maskWord(word: string): string {
  return '□'.repeat([...word].length);
}
