import unittest
from build import normalize_conversation


class NormalizationFenceTests(unittest.TestCase):
    def test_tool_calls_must_not_be_silently_discarded(self):
        turns = [{'role': 'user', 'content': 'Build a room'},
                 {'role': 'assistant', 'content': 'Working',
                  'tool_calls': [{'function': {'name': 'create_instances', 'arguments': '{}'}}]}]
        self.assertIsNone(normalize_conversation(turns))

    def test_truncated_reasoning_is_not_an_answer(self):
        turns = [{'role': 'user', 'content': 'Explain Luau'},
                 {'role': 'assistant', 'content': '<think>unfinished reasoning'}]
        self.assertIsNone(normalize_conversation(turns))

    def test_plain_answer_remains(self):
        turns = [{'role': 'user', 'content': 'Explain Luau'},
                 {'role': 'assistant', 'content': 'Luau supports optional type annotations.'}]
        self.assertEqual(normalize_conversation(turns), turns)


if __name__ == '__main__':
    unittest.main()
