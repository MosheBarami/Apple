import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists, artistOf } from '../src/ingest-game-icons.mjs';

const LICENCE = `Each sub-folders in this archive correspond to a different contributor :

- Lorc, http://lorcblog.blogspot.com
- Viscious Speed, http://viscious-speed.deviantart.com - CC0
- Lucas
- Andy Meneely, http://www.se.rit.edu/~andy/
- Zeromancer - CC0
`;

test('license.txt gives each artist, and which ones are CC0', () => {
  const who = artists(LICENCE);
  assert.deepEqual(who.get('lorc'), { name: 'Lorc', cc0: false });
  assert.deepEqual(who.get('visciousspeed'), { name: 'Viscious Speed', cc0: true });
  assert.deepEqual(who.get('zeromancer'), { name: 'Zeromancer', cc0: true });
});

test('a folder finds its artist by the same letters, or by the name it starts with', () => {
  const who = artists(LICENCE);
  assert.equal(artistOf(who, 'viscious-speed').name, 'Viscious Speed');
  assert.equal(artistOf(who, 'andymeneely').name, 'Andy Meneely');
  assert.equal(artistOf(who, 'lucasms').name, 'Lucas');
  assert.equal(artistOf(who, 'badges'), undefined);
});
