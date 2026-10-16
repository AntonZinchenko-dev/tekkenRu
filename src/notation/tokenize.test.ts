import { describe, expect, it } from 'vitest';
import { splitSteps, tokenize } from './tokenize';

const show = (s: string, st: string[] = []) =>
  tokenize(s, st)
    .map((t) => {
      switch (t.t) {
        case 'dir': return t.hold ? t.d.toUpperCase() : t.d;
        case 'motion': return `<${t.name}>`;
        case 'btn': return `[${t.b.join('+')}${t.hold ? '*' : ''}]`;
        case 'stance': return `{${t.abbr}}`;
        case 'tag': return `#${t.kind}`;
        case 'sep': return t.s;
        case 'step': return '→';
        case 'paren': return t.v;
        case 'text': return `"${t.v}"`;
      }
    })
    .join(' ');

describe('tokenize', () => {
  const lili = ['H', 'ws', 'SS', 'FC', 'BT', 'DEW', 'RAB'];
  it.each([
    ['df2 → f2,3 → df3+4 → bt1,2 T! → u1+2 (Hold) → qcf1,4', 'df [2] → f [2] , [3] → df [3+4] → {bt} [1] , [2] #TORNADO → u [1+2] #HOLD → <qcf> [1] , [4]'],
    ['ff3f3+4', 'f f [3] f [3+4]'],
    ['f,F+4', 'f , F [4]'],
    ['DEW DF4', '{dew} df [4]'],
    ['B1,4 T!', 'b [1] , [4] #TORNADO'],
    ['H.2+3', '{h} [2+3]'],
    ['FC.df1', '{fc} df [1]'],
    ['BT d+2', '{bt} d [2]'],
    ['WR1+2', '{wr} [1+2]'],
    ['ss4', '{ss} [4]'],
    ['b+3*', 'b [3*]'],
    ['d,DF+1', 'd , DF [1]'],
    ['f,n,d,df+2', 'f , n , d , df [2]'],
    ['CH f4', '#CH f [4]'],
    ['RAB.2', '{rab} [2]'],
    ['low parry', '"лоу парри"'],
    ['1,1 (3)', '[1] , [1] ( [3] )'],
    ['d/f+1', 'df [1]'],
    ['qcf3 on the ground', '<qcf> [3] "на земле"'],
  ])('%s', (src, expected) => {
    expect(show(src, lili)).toBe(expected);
  });

  it('splits steps', () => {
    expect(splitSteps(tokenize('df2 → f2,3 -> qcf1')).length).toBe(3);
  });
});
