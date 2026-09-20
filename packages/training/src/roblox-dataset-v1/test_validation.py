import unittest
import shutil
from validate import compile_batch, compiler_controls, policy_flags, code_blocks, near_dedupe, api_review


class ValidationTests(unittest.TestCase):
    def test_real_compiler_control_distinguishes_syntax_from_runtime(self):
        compiler = shutil.which('luau-compile')
        self.assertIsNotNone(compiler, 'Compiler unavailable: cannot claim syntax validation')
        result = compiler_controls(compiler)
        self.assertEqual([x['status'] for x in result['observed']], ['pass', 'fail', 'pass', 'pass'])

    def test_unavailable_compiler_is_not_bad_source_or_pass(self):
        self.assertEqual(compile_batch(['return 1'], '/nonexistent/luau-compile')[0]['status'], 'unverified')

    def test_user_broken_code_is_not_checked_as_assistant_answer(self):
        messages = [{'role': 'user', 'content': 'Fix this:\n```lua\nlocal =\n```'},
                    {'role': 'assistant', 'content': '```luau\nreturn 1\n```'}]
        blocks, _, _ = code_blocks(messages)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]['code'].strip(), 'return 1')

    def test_unclosed_fence_is_not_silently_clean(self):
        _, _, malformed = code_blocks([{'role': 'assistant', 'content': '```luau\nreturn 1'}])
        self.assertTrue(malformed)

    def test_non_luau_not_claimed_compiled(self):
        blocks, unsupported, _ = code_blocks([{'role': 'assistant', 'content': '```python\nprint(1)\n```'}])
        self.assertEqual(blocks, [])
        self.assertEqual(unsupported, 1)

    def test_unresolved_api_is_review_not_declared_runtime_failure(self):
        result = api_review({'classes': ['Part', 'InventedPart'], 'enums': ['KeyCode.W', 'KeyCode.FAKE']},
                            {'classes': {'Part': {}}, 'enums': {'KeyCode': ['W']}})
        self.assertEqual(result, ['class_or_service:InventedPart', 'enum_member:KeyCode.FAKE'])

    def test_dangerous_static_flag_cannot_pass(self):
        flags = policy_flags({'status': 'pass'}, {'available': True, 'dangerous': ['dynamic_code_loader']},
                             {'classes': {}, 'enums': {}})
        self.assertEqual(flags, ['dynamic_code_loader'])

    def test_near_dedupe_keeps_one_and_fences_repository_groups(self):
        text = '\n'.join('local value%d = %d' % (i, i) for i in range(100))
        rows = [{'id': 'a', 'kind': 'source_code', 'text': text, 'group': 'repo/a', 'provenance': {}},
                {'id': 'b', 'kind': 'source_code', 'text': text + '\nreturn value1', 'group': 'repo/b', 'provenance': {}},
                {'id': 'c', 'kind': 'source_code', 'text': 'return function(a,b) return a+b end', 'group': 'repo/b', 'provenance': {}}]
        kept, removed, report = near_dedupe(rows)
        self.assertEqual(len(kept), 2)
        self.assertEqual(len(removed), 1)
        self.assertEqual(kept[0]['group'], kept[1]['group'])
        self.assertEqual(kept[0]['split'], kept[1]['split'])
        self.assertGreaterEqual(report['near_links'][0]['jaccard'], .9)

    def test_literal_contents_survive_dedupe(self):
        rows = [{'id': str(i), 'kind': 'source_code', 'text': 'return "'+text+'"', 'group': 'r/'+str(i), 'provenance': {}}
                for i, text in enumerate(['two words', 'twowords'])]
        kept, removed, _ = near_dedupe(rows)
        self.assertEqual(len(kept), 2)
        self.assertEqual(removed, [])


if __name__ == '__main__':
    unittest.main()
