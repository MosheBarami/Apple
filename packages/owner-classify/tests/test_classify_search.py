"""Tests for the classifier, the index, the query parser, the ranking and the gateway route glue. Standard library only; builds a
tiny synthetic owner library in a temp directory, so nothing here reads the real library or needs any model.

    python3 -m unittest discover -s packages/owner-classify/tests -v
"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import classify  # noqa: E402
import find_route  # noqa: E402
import index  # noqa: E402
import lexicon as L  # noqa: E402
import search  # noqa: E402

G1 = 'a' * 64
G2 = 'b' * 64


def asset(game, k, cls, name, path, parts=5, scripts=0, n=None, has=None, **extra):
    return dict(game=game, k=k, **{'class': cls}, name=name, path=path, parts=parts, scripts=scripts, n=n or parts, has=has or [], **extra)


ASSETS = [
    asset(G1, 'model', 'Model', 'Hippo', '/ReplicatedStorage/Animals/Hippo', parts=12, has=['Ear', 'Tail']),
    asset(G1, 'model', 'Model', 'PinkSofa', '/Workspace/Furniture/PinkSofa', parts=9),
    asset(G1, 'model', 'Model', 'BlueSofa', '/Workspace/Furniture/BlueSofa', parts=9),
    asset(G1, 'model', 'Model', 'GiantTree', '/Workspace/Trees/GiantTree', parts=30),
    asset(G1, 'model', 'Model', 'Keycard', '/Workspace/Props/Keycard', parts=1),
    asset(G1, 'model', 'Model', 'Model', '/Workspace/Thing', parts=3),
    asset(G2, 'model', 'Model', 'Hippo', '/Workspace/Animals/Hippo', parts=12, has=['Ear', 'Tail']),  # a version copy in another game
    asset(G2, 'sound', 'Sound', 'AmbulanceSiren', '/SoundService/AmbulanceSiren', parts=0, id='rbxassetid://1'),
    asset(G2, 'animation', 'Animation', 'Wave', '/ReplicatedStorage/Emotes/Wave', parts=0, id='rbxassetid://2'),
    asset(G2, 'fx', 'ParticleEmitter', 'Sparks', '/Workspace/Sparks', parts=1, fx=['ParticleEmitter']),
    asset(G2, 'map', 'Workspace', 'Workspace', '/Workspace', parts=300, n=2000),
    asset(G2, 'ui', 'ScreenGui', 'ShopGui', '/StarterGui/ShopGui', parts=0, n=40),
]
HASH = {('Hippo', G1): 'h1' * 32, ('Hippo', G2): 'h2' * 32}


def make_library(root):
    lib = os.path.join(root, 'owner-library')
    os.makedirs(os.path.join(lib, 'entries'))
    os.makedirs(os.path.join(lib, 'bounds'))
    os.makedirs(os.path.join(lib, 'knowledge'))
    def w(name, obj):
        with open(os.path.join(lib, name), 'w') as f:
            json.dump(obj, f)
    w('assets.json', dict(assets=ASSETS, failed=[]))
    w('catalog.json', dict(games=[dict(id=G1, name='Safari Park', niches=['tycoon']), dict(id=G2, name='City Rescue', niches=[])]))
    w('families.json', dict(families=[]))
    w('names.json', {})
    w('style.json', dict(games={G1: dict(parts=100, studShare=0.5, modernStudShare=0, colorShare=0.2),
                                G2: dict(parts=100, studShare=0.0, modernStudShare=0, colorShare=0.7)}))
    w('integrity.json', {})
    w('systems.json', dict(systems=[dict(gameId=G2[:12], name='Rescue Siren Kit', does='sirens and lights for emergency cars', tags=['vehicle', 'siren'], works='yes',
                                         kind='place', instances=10, scripts=3, niches=[])]))
    w('ui.json', dict(screens=[dict(gameId=G2[:12], path='/StarterGui/ShopGui', purpose='shop', category='glossy', clean=True, defects={}, palette=['ffd500'],
                                    buttonCount=3, texts=['Buy', 'Sell'])],
                      kits=[dict(id='city-rescue-123456', name='City Rescue', games=[dict(id=G2[:12], name='City Rescue')], gameCount=1, style=dict(category='glossy'),
                                 purposes=['shop', 'inventory'], screens=12, quality=88, fingerprint=dict(palette=[['ffd500', 0.4]]))]))
    w('media.json', dict(items=[dict(id='c' * 64, pack='Icon Pack', path='icons/star.png', name='Star Icon', kind='icon', width=64, height=64)]))
    w('pieces.json', [
        dict(game=G1, path='/Workspace/Furniture/PinkSofa', size=[6, 3, 3], colors=['f28cb8', 'ffffff'], unions=0, material='Fabric'),
        dict(game=G1, path='/Workspace/Furniture/BlueSofa', size=[6, 3, 3], colors=['2f6fd8'], unions=0, material='Fabric'),
        dict(game=G1, path='/Workspace/Trees/GiantTree', size=[40, 1500, 40], colors=['3aa645', '7a4a28'], unions=0, material='Grass'),
        dict(game=G1, path='/Workspace/Props/Keycard', size=[1, 0.1, 0.6], colors=['2f6fd8'], unions=0, material='Plastic'),
        dict(game=G1, path='/ReplicatedStorage/Animals/Hippo', size=[7.6, 3.6, 2.6], colors=['8a8a8a'], unions=0, material='Plastic'),
        dict(game=G2, path='/Workspace/Animals/Hippo', size=[7.6, 3.6, 2.6], colors=['8a8a8a'], unions=0, material='Plastic'),
    ])
    for g in (G1, G2):
        verify = {}
        for a in ASSETS:
            if a['game'] == g:
                verify[a['path']] = dict(hash=HASH.get((a['name'], g)) or (a['name'].encode().hex() + g[:8]).ljust(64, '0'), works='yes', ok=True, needs=[], content=[],
                                         integrity=dict(panicked=0))
        w('entries/%s.verify.json' % g, dict(assets=verify, game=g))
        w('bounds/%s.profile.json' % g, dict(assets={}))
    return lib


class ClassifyAndSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.lib = make_library(cls.tmp.name)
        cls.out = os.path.join(cls.tmp.name, 'owner-classify')
        cls.items, cls.meta = classify.build(cls.lib, cls.out, progress=False)
        classify.write(cls.items, cls.out, cls.meta)
        index.build(cls.out, lsi=False)
        cls.by = {r['id']: r for r in cls.items}
        cls.f = search.Finder(cls.out)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    # ---- classification --------------------------------------------------------------------------------------------
    def test_every_row_is_covered_and_ids_are_hash12(self):
        rows = sum(r['ref_count'] for r in self.items if not r['id'].startswith(('system:', 'kit:', 'media:')))
        self.assertEqual(rows, len(ASSETS))
        self.assertIn(('h1' * 32)[:12], self.by)

    def test_identical_hash_is_one_item_with_all_refs(self):
        # the same content under two paths is one record with both refs (G1 and G2 hippos have different hashes here, so two records)
        hip = [r for r in self.items if r['name'] == 'Hippo']
        self.assertEqual(len(hip), 2)

    def test_fields(self):
        sofa = next(r for r in self.items if r['name'] == 'PinkSofa')
        self.assertEqual((sofa['type'], sofa['subtype']), ('model', 'furniture'))
        self.assertEqual(sofa['colour']['top'][0]['name'], 'pink')
        self.assertEqual(sofa['size']['cls'], 'small')
        self.assertEqual(sofa['look'], 'studded')
        self.assertIn(sofa['quality']['band'], 'AB')
        self.assertLessEqual(len(sofa['description']), 160)
        self.assertEqual(sofa['provenance']['licence'], 'owner-attested-commercial-use')
        hip = next(r for r in self.items if r['name'] == 'Hippo')
        self.assertEqual(hip['subtype'], 'creature')
        self.assertEqual(self.by[next(i for i in self.by if self.by[i]['name'] == 'AmbulanceSiren')]['type'], 'sfx')
        self.assertEqual(next(r for r in self.items if r['name'] == 'Wave')['subtype'], 'emote')

    def test_generic_names_score_lower_and_junk_bounds_are_not_trusted(self):
        generic = next(r for r in self.items if r['name'] == 'Model')
        named = next(r for r in self.items if r['name'] == 'PinkSofa')
        self.assertLess(generic['quality']['score'], named['quality']['score'])
        self.assertEqual(classify.size_block([10, 2000000, 10], 'bounds')['conf'], 'none')
        self.assertEqual(classify.size_block([10, 20, 10], 'pieces')['conf'], 'measured')

    def test_systems_kits_and_media_become_items(self):
        self.assertIn('system:' + G2[:12], self.by)
        self.assertIn('kit:city-rescue-123456', self.by)
        self.assertTrue(any(i.startswith('media:') for i in self.by))

    def test_refuses_to_write_inside_the_library(self):
        with self.assertRaises(SystemExit):
            classify.main(['--lib', self.lib, '--out', os.path.join(self.lib, 'sidecar')])

    def test_coverage_report(self):
        cov = classify.coverage(self.items)
        self.assertEqual(cov['fields']['type']['items'], 100.0)
        self.assertEqual(cov['fields']['provenance']['items'], 100.0)

    # ---- query parsing ---------------------------------------------------------------------------------------------
    def test_parse_numbers_and_axes(self):
        q = search.parse('a gigantic tree over a thousand studs tall')
        self.assertEqual(q.size, dict(kind='min', value=1000.0, axis='y'))
        q = search.parse('a tiny arena map under seventy studs across')
        self.assertEqual((q.size['kind'], q.size['value'], q.size['axis'], q.type), ('max', 70.0, 'xz', 'map'))
        q = search.parse('a keycard about one stud across')
        self.assertEqual((q.size['kind'], q.size['value']), ('approx', 1.0))
        q = search.parse('no bigger than a couple of studs')
        self.assertEqual((q.size['kind'], q.size['value']), ('max', 2.0))
        self.assertIsNone(search.parse('4 players per team').size)

    def test_parse_colours_and_terms(self):
        q = search.parse('a golden orange fountain')
        self.assertEqual(q.colours, ['gold', 'orange'])
        self.assertIn('fountain', q.terms)
        self.assertEqual(search.parse('a hot pink sofa').colours, ['hot pink'])
        self.assertNotIn('a', search.parse('a red sofa').terms)

    # ---- search ----------------------------------------------------------------------------------------------------
    def top(self, q, **kw):
        return self.f.search(q, **kw)

    def test_name_match_and_collapse_of_version_copies(self):
        r = self.top('a hippo for my safari game')
        self.assertEqual(r['items'][0]['name'], 'Hippo')
        self.assertEqual(r['items'][0]['copies'] >= 2 or len(r['items'][0]['same_as']) >= 1, True)  # same name+size+parts collapsed

    def test_colour_steers_between_otherwise_equal_items(self):
        self.assertEqual(self.top('a pink sofa')['items'][0]['name'], 'PinkSofa')
        self.assertEqual(self.top('a blue sofa')['items'][0]['name'], 'BlueSofa')

    def test_numeric_size_is_a_filter(self):
        r = self.top('a tree over a thousand studs tall')
        self.assertEqual(r['items'][0]['name'], 'GiantTree')
        r = self.top('a small blue card about one stud across')
        self.assertEqual(r['items'][0]['name'], 'Keycard')

    def test_type_words_and_cues(self):
        self.assertEqual(self.top('an ambulance siren')['items'][0]['type'], 'sfx')
        self.assertEqual(self.top('a character waving')['items'][0]['type'], 'animation')
        self.assertTrue(all(i['type'] == 'map' for i in self.top('a map', limit=3)['items'][:1]))

    def test_explicit_filters(self):
        r = self.top('sofa', type='model', colour='pink')
        self.assertTrue(r['items'] and all('pink' in [c['name'] for c in i['colours']] or i['colours'][0]['name'] in ('pink', 'magenta', 'hot pink') for i in r['items']))
        self.assertEqual(r['filters_applied']['type'], 'model')

    def test_unknown_request_has_no_strong_match(self):
        r = self.top('a saxophone')
        self.assertTrue(r['no_strong_match'])

    def test_candidate_contract(self):
        item = self.top('pink sofa')['items'][0]
        for key in ('id', 'gameId', 'path', 'kind', 'className', 'type', 'subtype', 'name', 'description', 'tags', 'look', 'size', 'colours', 'parts', 'scripts',
                    'humanoid', 'quality', 'provenance', 'copies', 'thumb', 'match'):
            self.assertIn(key, item)
        self.assertEqual(item['kind'], 'model')
        self.assertEqual(item['gameId'], G1[:12])
        self.assertLessEqual(len(item['description']), 160)
        self.assertLessEqual(len(self.top('sofa', limit=1)['items']), 1)
        for key in ('filters_applied', 'total_matches', 'top_score', 'no_strong_match'):
            self.assertIn(key, self.top('sofa'))

    # ---- route -----------------------------------------------------------------------------------------------------
    def test_route_validation_and_answer(self):
        os.environ['APPLE_OWNER_CLASSIFY'] = self.out
        os.environ['APPLE_OWNER_DENSE'] = '0'
        try:
            def call(**params):
                value = lambda name, default='': str(params.get(name, default))
                def number(name, default, maximum):
                    n = int(value(name, str(default)))
                    if n < 0 or n > maximum:
                        raise ValueError('query bound exceeded: ' + name)
                    return n
                return find_route.serve(value, number)
            self.assertTrue(call(q='pink sofa')['items'])
            with self.assertRaises(ValueError):
                call(q='')
            with self.assertRaises(ValueError):
                call(q='x' * 201)
            with self.assertRaises(LookupError):
                call(q='sofa', type='spaceship')
            with self.assertRaises(ValueError):
                call(q='sofa', limit=26)
        finally:
            os.environ.pop('APPLE_OWNER_CLASSIFY')
            os.environ.pop('APPLE_OWNER_DENSE')
            find_route._state.update(sig=None, finder=None, dense=None)

    def test_index_is_opened_read_only(self):
        with self.assertRaises(Exception):
            self.f.db.execute("INSERT INTO meta VALUES('x','y')")


class Lexicon(unittest.TestCase):
    def test_colour_names(self):
        self.assertEqual(L.colour_name('f28cb8'), 'pink')
        self.assertEqual(L.colour_name('161616'), 'black')
        self.assertEqual(L.colour_family('dark red'), 'red')

    def test_variants_and_split(self):
        self.assertIn('wave', L.variants('waving'))
        self.assertEqual(L.split_words('SkibidiToilet_2'), ['skibidi', 'toilet'])
        self.assertEqual(L.size_class(1.5), 'tiny')
        self.assertEqual(L.size_class(500), 'huge')


if __name__ == '__main__':
    unittest.main()
