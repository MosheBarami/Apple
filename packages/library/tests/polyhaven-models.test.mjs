import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOfModel, familyOfModel, fitsRoblox } from '../src/ingest-polyhaven-models.mjs';

test('a Poly Haven model is a building, a vehicle or a prop by its category path', () => {
  assert.equal(kindOfModel({ category: 'Architecture/Walls' }), 'building');
  assert.equal(kindOfModel({ category: 'Vehicles & Transport/Boats' }), 'vehicle');
  assert.equal(kindOfModel({ category: 'Furniture/Seating/Chairs' }), 'prop');
});

test('a model made for a collection keeps that family, else its top category', () => {
  assert.equal(familyOfModel({ categories: ['props', 'collection: hidden_alley'], category: 'Decor & Art/Signs' }), 'polyhaven:hidden-alley');
  assert.equal(familyOfModel({ categories: ['furniture'], category: 'Furniture/Seating' }), 'polyhaven:furniture');
});

test('a dense photoscan that Roblox would not import is left out', () => {
  assert.equal(fitsRoblox({ triangles: 5626, meshes: 1 }), true);
  assert.equal(fitsRoblox({ triangles: 30_000, meshes: 1 }), false); // over 20,000 in one mesh
  assert.equal(fitsRoblox({ triangles: 60_000, meshes: 4 }), true);
  assert.equal(fitsRoblox({ triangles: 120_000, meshes: 12 }), false); // over 100,000 in all
});
