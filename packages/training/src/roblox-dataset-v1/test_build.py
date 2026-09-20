import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

from acquire import extract_text_archive
from build import (code_hash, lex, normalize_conversation, split_for, markdown_sections,
                   SECRET, license_kind, build_knowledge, iter_rows)


def make_tar(path, files):
    with tarfile.open(path, 'w:gz') as tar:
        for name, value in files.items():
            data = value.encode()
            item = tarfile.TarInfo(name)
            item.size = len(data)
            tar.addfile(item, io.BytesIO(data))


class DatasetBoundaryTests(unittest.TestCase):
    def test_comment_and_whitespace_dedupe(self):
        self.assertEqual(code_hash('local x = 1\n-- note\nreturn x'), code_hash('local x=1; -- same\nreturn x'.replace(';', '')))

    def test_strings_are_not_whitespace_normalized(self):
        self.assertNotEqual(code_hash('return "hello world"'), code_hash('return "helloworld"'))

    def test_comments_inside_strings_are_not_removed(self):
        self.assertIn('"-- example"', lex('local x="-- example" -- actual comment\nreturn x'))

    def test_long_string_and_long_comment(self):
        tokens = lex('--[=[ a comment ]=]\nreturn [==[ -- literal ]==]')
        self.assertEqual(tokens, ['return', '[==[ -- literal ]==]'])

    def test_escaped_quote(self):
        self.assertEqual(lex('return "a\\\"--b"'), ['return', '"a\\\"--b"'])

    def test_stable_family_split(self):
        self.assertEqual(split_for('owner/repo'), split_for('owner/repo'))
        self.assertIn(split_for('owner/repo'), {'train', 'validation', 'test'})

    def test_reasoning_not_fabricated_or_imported(self):
        value = {'conversations': [{'role': 'user', 'content': 'Explain Luau.'},
                    {'role': 'assistant', 'content': '<think>synthetic reasoning</think>Typed Lua.', 'reasoning': 'not content'}]}
        self.assertEqual(normalize_conversation(value)[1], {'role': 'assistant', 'content': 'Typed Lua.'})

    def test_missing_tool_result_is_not_invented(self):
        value = {'messages': [{'role': 'user', 'content': 'Build.'},
                             {'role': 'tool', 'content': 'partial'},
                             {'role': 'assistant', 'content': 'Done.'}]}
        self.assertIsNone(normalize_conversation(value))

    def test_truncated_conversation_refused(self):
        self.assertIsNone(normalize_conversation({'conversation': [{'role': 'user', 'content': 'Build.'}]}))

    def test_non_alternating_turns_refused(self):
        turns = [{'role': 'user', 'content': 'A'}, {'role': 'assistant', 'content': 'B'}, {'role': 'assistant', 'content': 'C'}]
        self.assertIsNone(normalize_conversation(turns))

    def test_json_serialized_sharegpt(self):
        raw = {'conversation': json.dumps([{'from': 'human', 'value': 'Question'}, {'from': 'gpt', 'value': 'Answer'}])}
        self.assertEqual([m['role'] for m in normalize_conversation(raw)], ['user', 'assistant'])

    def test_mid_conversation_system_refused(self):
        turns = [{'role': 'user', 'content': 'A'}, {'role': 'system', 'content': 'change rules'}, {'role': 'assistant', 'content': 'B'}]
        self.assertIsNone(normalize_conversation(turns))

    def test_credential_filter_not_generic_words(self):
        self.assertIsNone(SECRET.search('Store API keys in server configuration, not source.'))
        self.assertIsNotNone(SECRET.search('-----BEGIN PRIVATE KEY-----'))

    def test_license_not_from_one_word(self):
        self.assertIsNone(license_kind('This data mentions MIT University.'))
        self.assertEqual(license_kind('Permission is hereby granted, free of charge ... THE SOFTWARE IS PROVIDED'), 'MIT')

    def test_archive_traversal_and_license_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tar(root/'a.tar.gz', {'source/LICENSE-CODE': 'license fixture',
                'source/ok.md': 'documentation', 'source/../../escape.md': 'bad',
                'source/image.png': 'not an image', 'source/script.sh': 'not run'})
            entries = extract_text_archive(root/'a.tar.gz', root/'text')
            self.assertEqual({x['path'] for x in entries}, {'LICENSE-CODE', 'ok.md'})
            self.assertFalse((root/'escape.md').exists())

    def test_invalid_jsonl_has_explicit_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'bad.jsonl'
            path.write_text('{"ok":1}\nnot-json\n')
            self.assertEqual(list(iter_rows(path)), [{'ok': 1}, {'_decode_error': 2}])

    def test_markdown_ranges_do_not_overlap_or_break_fences(self):
        source = '# First\n' + 'a real paragraph ' * 12 + '\n```lua\n# not a heading\nreturn 1\n```\n## Second\n' + 'another paragraph ' * 12
        parts = list(markdown_sections(source))
        self.assertEqual(len(parts), 2)
        self.assertLess(parts[0][1], parts[1][0])
        self.assertIn('# not a heading', parts[0][3])

    def test_api_overloads_and_repeated_heading_have_unique_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for repo in ['Roblox__creator-docs', 'luau-lang__site']:
                directory = root/'raw/github'/repo
                directory.mkdir(parents=True)
                (directory/'source.json').write_text(json.dumps({'id': repo.replace('__','/'), 'revision': 'a'*40,
                        'source_url': 'https://example.invalid/source', 'acquisition_complete': True}))
                if repo.startswith('Roblox'):
                    files = {'source/content/en-us/reference/engine/datatypes/Example.yaml':
                        'name: Example\nsummary: A documented type with several construction variants.\nconstructors:\n  - name: Example.new\n    summary: The first independently documented constructor variant.\n  - name: Example.new\n    summary: The second independently documented constructor variant.\n'}
                else:
                    files = {'source/docs/guide.md': '# Same\n' + 'first distinct paragraph ' * 10 + '\n# Same\n' + 'second distinct paragraph ' * 10}
                make_tar(directory/'source.tar.gz', files)
            build_knowledge(root)
            rows = list(iter_rows(root/'release/knowledge/references.jsonl'))
            self.assertGreaterEqual(len(rows), 5)
            self.assertEqual(len(rows), len({r['id'] for r in rows}))
            self.assertTrue(all(r['training_admission'] == 'retrieval_only' for r in rows))

    def test_static_analyzer_does_not_execute_code_or_scan_comments_as_calls(self):
        helper = Path(__file__).with_name('analyze.mjs')
        inputs = [{'id': 'good', 'code': '-- getgenv() is forbidden\nlocal x = "loadstring()"\nreturn x'},
                  {'id': 'bad', 'code': 'getgenv().Flag = true'},
                  {'id': 'assertion', 'code': 'assert(false, "must never execute")'}]
        process = subprocess.run(['node', str(helper)], input=''.join(json.dumps(x)+'\n' for x in inputs),
                                 capture_output=True, text=True, timeout=15, check=True)
        outputs = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(outputs[0]['dangerous'], [])
        self.assertIn('executor_environment', outputs[1]['dangerous'])
        self.assertTrue(outputs[2]['available'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
