"""
マンガ情報取得スクリプト
Claude API を使い、マンガタイトルごとに巻数・出版社・連載状況を取得する。
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import anthropic

MODEL = "claude-sonnet-4-20250514"
BATCH_SIZE = 25
SLEEP_BETWEEN_BATCHES = 2


def load_manga_list(input_file: str) -> list[dict]:
    with open(input_file, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader)


def load_existing_results(output_file: str) -> dict[str, dict]:
    if not Path(output_file).exists():
        return {}
    with open(output_file, encoding="utf-8") as f:
        data = json.load(f)
    return {item["title"]: item for item in data}


def save_results(output_file: str, results: list[dict]) -> None:
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def build_prompt(titles: list[str]) -> str:
    titles_json = json.dumps(titles, ensure_ascii=False)
    return f"""以下の日本のマンガ作品について情報をJSON配列で返してください。

対象作品: {titles_json}

各作品について以下のキーで回答してください:
- title: 作品名（入力と同じ文字列）
- volumes: 既刊巻数（整数。不明はnull）
- publisher: 出版社名（日本語）
- serialization_status: "連載中" / "完結" / "休載中" / "不明" のいずれか
- confidence: "高" / "中" / "低" のいずれか
- note: 備考（カラー版・外伝・電子書籍のみ等。なければ空文字）

品質基準:
- confidence "高": メジャータイトルで出版社・巻数が確実
- confidence "中": 概ね正しいが巻数が変動中 or やや認知度が低い
- confidence "低": マイナータイトル、情報不足、特殊ケース

JSON配列のみ返すこと。説明文・前置き不要。"""


def fetch_batch(client: anthropic.Anthropic, titles: list[str]) -> list[dict] | None:
    prompt = build_prompt(titles)
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()

        # ```json ... ``` ブロックが返る場合に対応
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text)
        if json_match:
            raw_text = json_match.group(1).strip()

        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"  [警告] JSONパースエラー: {e}", file=sys.stderr)
        return None
    except anthropic.APIError as e:
        print(f"  [警告] APIエラー: {e}", file=sys.stderr)
        return None


def make_stub_entries(titles: list[str]) -> list[dict]:
    return [
        {
            "title": t,
            "volumes": None,
            "publisher": "不明",
            "serialization_status": "不明",
            "confidence": "低",
            "note": "取得失敗",
        }
        for t in titles
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="マンガ情報取得スクリプト")
    parser.add_argument("--input", required=True, help="入力CSVファイル（UTF-8 BOM付き）")
    parser.add_argument("--output", required=True, help="出力JSONファイル")
    parser.add_argument("--limit", type=int, help="処理件数上限（テスト用）")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("エラー: ANTHROPIC_API_KEY 環境変数が設定されていません", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"マンガリストを読み込み中: {args.input}")
    mangas = load_manga_list(args.input)
    if args.limit:
        mangas = mangas[: args.limit]
    total = len(mangas)
    print(f"対象件数: {total}")

    existing = load_existing_results(args.output)
    print(f"既処理件数: {len(existing)}")

    # 未処理のものだけ抽出
    pending = [m for m in mangas if m["正式な作品名"] not in existing]
    print(f"処理待ち件数: {len(pending)}")

    results: list[dict] = list(existing.values())

    for batch_start in range(0, len(pending), BATCH_SIZE):
        batch = pending[batch_start : batch_start + BATCH_SIZE]
        titles = [m["正式な作品名"] for m in batch]

        processed_so_far = len(existing) + batch_start
        print(
            f"処理中: {processed_so_far + 1}〜{processed_so_far + len(batch)} / {total}",
            flush=True,
        )

        batch_results = fetch_batch(client, titles)
        if batch_results is None:
            print(f"  バッチ失敗 → スタブ登録", file=sys.stderr)
            batch_results = make_stub_entries(titles)

        # タイトルをキーにマージ（APIが順序を変えても対応）
        result_map = {r["title"]: r for r in batch_results}
        for title in titles:
            entry = result_map.get(title)
            if entry is None:
                entry = make_stub_entries([title])[0]
            results.append(entry)

        save_results(args.output, results)

        if batch_start + BATCH_SIZE < len(pending):
            time.sleep(SLEEP_BETWEEN_BATCHES)

    print(f"\n完了。結果を保存しました: {args.output}")
    print(f"総件数: {len(results)}")


if __name__ == "__main__":
    main()
