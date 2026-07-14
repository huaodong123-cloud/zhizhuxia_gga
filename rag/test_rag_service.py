import tempfile
import unittest
from pathlib import Path

import rag.rag_service as rag


class RagServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_data_root = rag.DATA_ROOT
        rag.DATA_ROOT = Path(self.tmp.name) / "games"

    def tearDown(self):
        rag.DATA_ROOT = self.original_data_root
        self.tmp.cleanup()

    def test_query_palworld_seed_style_knowledge(self):
        rag.save_documents("palworld", [
            {
                "id": "palworld-ore-base",
                "title": "金属矿据点",
                "text": "幻兽帕鲁前期可以把据点建在金属矿密集区域，安排碎岩龟或猫蝠怪采矿。",
                "tags": ["据点", "金属矿", "采矿"],
                "source": "seed",
            },
            {
                "id": "palworld-food",
                "title": "食物生产",
                "text": "浆果田和烤莓果可以解决早期饱食度，后期再升级蛋糕流水线。",
                "tags": ["食物", "蛋糕"],
                "source": "seed",
            },
        ])

        results = rag.query_documents("palworld", "金属矿 据点 怎么建", 3)

        self.assertEqual(results[0]["id"], "palworld-ore-base")
        self.assertGreater(results[0]["score"], 0)

    def test_upsert_replaces_document_by_id(self):
        rag.save_documents("palworld", [{"id": "a", "title": "旧", "text": "旧内容", "tags": [], "source": "seed"}])

        merged = rag.merge_documents(rag.load_documents("palworld"), [
            {"id": "a", "title": "新", "text": "新内容", "tags": ["更新"], "source": "test"}
        ])
        rag.save_documents("palworld", merged)

        docs = rag.load_documents("palworld")
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["title"], "新")

    def test_rejects_invalid_game_id(self):
        with self.assertRaises(ValueError):
            rag.normalize_game_id("../palworld")

    def test_authorizes_when_no_token_is_configured(self):
        self.assertTrue(rag.is_authorized(None, None))

    def test_rejects_missing_bearer_token_when_configured(self):
        self.assertFalse(rag.is_authorized("secret-token", None))
        self.assertFalse(rag.is_authorized("secret-token", "Basic secret-token"))

    def test_accepts_matching_bearer_token(self):
        self.assertTrue(rag.is_authorized("secret-token", "Bearer secret-token"))


if __name__ == "__main__":
    unittest.main()
