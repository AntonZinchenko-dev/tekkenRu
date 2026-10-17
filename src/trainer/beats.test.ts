import { describe, expect, it } from 'vitest';
import { beatLabel, comboBeats, stepBeats } from './beats';

const labels = (s: string, st: string[] = []) => stepBeats(s, 0, st).map((b) => (b.pre.length ? `[${b.pre.join(',')}]` : '') + beatLabel(b) + (b.post.length ? `{${b.post.join(',')}}` : ''));

describe('stepBeats', () => {
  it.each([
    ['df2', ['df+2']],
    ['f2,3', ['f+2', '3']],
    ['df3+4', ['df+3+4']],
    ['bt1,2 T!', ['[BT]1', '2{T!}']],
    ['u1+2 (Hold)', ['U+1+2']],
    ['qcf1,4', ['d', 'df', 'f+1', '4']],
    ['ff3f3+4', ['f', 'f+3', 'f+3+4']],
    ['b1f', ['b+1', 'f']],
    ['f,F+4', ['f', 'F+4']],
    ['CH f4', ['[CH]f+4']],
    ['1,1 (3)', ['1', '1']],
    ['ws1,2f', ['[WS]1', '2', 'f']],
    ['DEW 3+4', ['[DEW]3+4']],
  ])('%s', (src, exp) => {
    expect(labels(src, ['DEW'])).toEqual(exp);
  });

  it('combo with starter', () => {
    const b = comboBeats('uf3', 'df2 → f2,3 → df3+4');
    expect(b.map(beatLabel)).toEqual(['uf+3', 'df+2', 'f+2', '3', 'df+3+4']);
    expect(b.map((x) => x.step)).toEqual([0, 1, 2, 2, 3]);
  });
});
