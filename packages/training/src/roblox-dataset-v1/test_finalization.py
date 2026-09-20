import unittest
from unittest.mock import patch
from finalize import align_groups
from validate import compiler_controls, sft_overlap_flags
from build import code_hash


class FinalizationTests(unittest.TestCase):
    def test_shared_code_across_tracks_cannot_get_opposing_splits(self):
        h = code_hash('return function(a,b) return a+b end')
        code = [{'id': 'code', 'group': 'repo/a', 'normalized_sha256': h}]
        sft = [{'id': 'sft', 'group': 'question/b', 'validation': {'code_blocks': [{'normalized_sha256': h}]},
                'messages': [{'role': 'assistant', 'content': 'A short reply'}]}]
        self.assertEqual(len(align_groups(code, sft)), 1)
        self.assertEqual(code[0]['group'], sft[0]['group'])
        self.assertEqual(code[0]['split'], sft[0]['split'])

    def test_shared_answer_across_questions_stays_together(self):
        rows = [{'id': str(i), 'group': 'q/'+str(i), 'validation': {'code_blocks': []},
                 'messages': [{'role': 'assistant', 'content': 'A complete long technical answer. '*20}]} for i in range(2)]
        align_groups([], rows)
        self.assertEqual(rows[0]['group'], rows[1]['group'])

    def test_compiler_that_says_everything_passes_is_rejected(self):
        with patch('validate.compile_batch', return_value=[{'status': 'pass'}]*4):
            with self.assertRaises(RuntimeError): compiler_controls('/not-used')

    def test_official_holdout_code_is_not_allowed_in_sft(self):
        code = 'return 42'
        self.assertEqual(sft_overlap_flags([{'code': code}], {code_hash(code)}), ['official_evaluation_code_overlap'])
        self.assertEqual(sft_overlap_flags([{'code': 'return 43'}], {code_hash(code)}), [])


if __name__ == '__main__':
    unittest.main()
