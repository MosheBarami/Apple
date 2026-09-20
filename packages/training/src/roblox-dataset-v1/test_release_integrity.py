import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest

from acquire import save_json, sha_file
from build import jsonl, digest, code_hash
from verify_release import verify


class ReleaseIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.release = self.root / 'release'
        provenance = {'source_id': 'author/source', 'revision': 'a' * 40,
                      'source_url': 'https://example.invalid/source'}
        code = {'id': 'source-1', 'kind': 'source_code', 'text': 'return 73',
                'provenance': provenance, 'static_filter': 'pass',
                'training_admission': 'candidate_only_requires_review', 'split': 'train',
                'group': 'repo/source', 'normalized_sha256': code_hash('return 73'),
                'validation': {'review_flags': [], 'engine_execution': 'not_run',
                               'compiler': {'status': 'pass'}}}
        sft = {'id': 'dialogue-1', 'kind': 'synthetic_conversation', 'provenance': provenance,
               'static_filter': 'pass', 'training_admission': 'candidate_only_requires_review',
               'split': 'validation', 'group': 'question/a',
               'messages': [{'role': 'user', 'content': 'Return a number.'},
                            {'role': 'assistant', 'content': '```luau\nreturn 79\n```'}],
               'validation': {'review_flags': [], 'engine_execution': 'not_run',
                              'code_blocks': [{'normalized_sha256': code_hash('return 79'),
                                               'compiler': {'status': 'pass'}}]}}
        ref = {'id': 'reference-1', 'kind': 'retrieval_reference', 'provenance': provenance,
               'split': 'reference', 'training_admission': 'retrieval_only',
               'text': 'An authored fixture used to test artifact integrity.'}
        self.rows = {}
        for name in ['code', 'sft']:
            for split in ['train', 'validation', 'test']:
                self.rows[name + '_candidates/' + split + '.jsonl'] = []
        self.rows['code_candidates/train.jsonl'] = [code]
        self.rows['sft_candidates/validation.jsonl'] = [sft]
        self.rows['knowledge/references.jsonl'] = [ref]
        self.write_fixture()

    def tearDown(self):
        self.tmp.cleanup()

    def write_fixture(self):
        files = []
        for rel, rows in self.rows.items():
            path = self.release / rel
            jsonl(path, rows)
            files.append({'path': rel, 'rows': len(rows), 'bytes': path.stat().st_size,
                          'sha256': sha_file(path), 'training_approved': False})
        self.manifest = {'schema': 'apple-roblox-research-candidate-v1', 'files': files,
                         'production_training_ready': False,
                         'counts': {'code_retained_candidates': 1, 'sft_retained_candidates': 1,
                                    'knowledge_reference_records': 1},
                         'splits': {'code': {'train': 1, 'validation': 0, 'test': 0},
                                    'sft': {'train': 0, 'validation': 1, 'test': 0}}}
        save_json(self.release / 'manifest.json', self.manifest)

    def run_verify(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return verify(self.root)

    def test_good_fixture_passes_integrity_but_not_semantic_quality(self):
        result = self.run_verify()
        self.assertEqual(result['records'], 3)
        self.assertTrue(result['integrity_pass'])
        self.assertFalse(result['semantic_quality_pass'])

    def test_modified_bytes_fail_before_record_interpretation(self):
        with (self.release / 'code_candidates/train.jsonl').open('a') as f:
            f.write('modified\n')
        with self.assertRaisesRegex(ValueError, 'checksum/size'):
            self.run_verify()

    def test_uncompiled_candidate_fails_even_with_updated_manifest(self):
        self.rows['code_candidates/train.jsonl'][0]['validation']['compiler']['status'] = 'unverified'
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, 'Uncompiled'):
            self.run_verify()

    def test_same_group_in_different_splits_fails(self):
        self.rows['sft_candidates/validation.jsonl'][0]['group'] = 'repo/source'
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, 'opposing splits'):
            self.run_verify()

    def test_same_code_cross_track_fails_even_when_group_names_differ(self):
        row = self.rows['sft_candidates/validation.jsonl'][0]
        row['validation']['code_blocks'][0]['normalized_sha256'] = code_hash('return 73')
        row['messages'][1]['content'] = '```luau\nreturn 73\n```'
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, 'opposing tracks/splits'):
            self.run_verify()

    def test_reference_cannot_be_promoted_to_training(self):
        self.rows['knowledge/references.jsonl'][0]['training_admission'] = 'ready'
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, 'Reference content'):
            self.run_verify()

    def test_wrong_aggregate_denominator_fails(self):
        self.manifest['counts']['code_retained_candidates'] = 2
        save_json(self.release / 'manifest.json', self.manifest)
        with self.assertRaisesRegex(ValueError, 'Aggregate count'):
            self.run_verify()

    def test_release_training_approval_flag_cannot_contradict_candidates(self):
        self.manifest['files'][0]['training_approved'] = True
        save_json(self.release / 'manifest.json', self.manifest)
        with self.assertRaisesRegex(ValueError, 'training approval'):
            self.run_verify()

    def test_a_split_cannot_be_omitted_from_manifest(self):
        self.manifest['files'] = [f for f in self.manifest['files'] if f['path'] != 'code_candidates/test.jsonl']
        save_json(self.release / 'manifest.json', self.manifest)
        with self.assertRaisesRegex(ValueError, 'manifest file set'):
            self.run_verify()

    def test_revision_must_be_immutable_not_main(self):
        self.rows['knowledge/references.jsonl'][0]['provenance'] = {
            'source_id': 'author/source', 'revision': 'main',
            'source_url': 'https://example.invalid/source'}
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, 'immutable revision'):
            self.run_verify()


if __name__ == '__main__':
    unittest.main()
