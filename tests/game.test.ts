import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateHitAndBlow, isValidHiraganaAnswer, pointForAnswerCount } from '../shared/game.js';

describe('hit and blow', () => {
  it('重複文字を過大カウントせずに判定する', () => {
    assert.deepEqual(calculateHitAndBlow('こころ', 'ころん'), { hits: 1, blows: 1 });
    assert.deepEqual(calculateHitAndBlow('たぬき', 'たぬき'), { hits: 3, blows: 0 });
  });

  it('ひらがなと文字数だけを有効回答にする', () => {
    assert.equal(isValidHiraganaAnswer('ひまわり', 4), true);
    assert.equal(isValidHiraganaAnswer('ヒマワリ', 4), false);
    assert.equal(isValidHiraganaAnswer('ひまわり!', 5), false);
    assert.equal(isValidHiraganaAnswer('ひまわり', 3), false);
  });

  it('回答数でポイントを決める', () => {
    assert.equal(pointForAnswerCount(5), 3);
    assert.equal(pointForAnswerCount(10), 2);
    assert.equal(pointForAnswerCount(11), 1);
  });
});
