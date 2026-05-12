"""
CSV変換スクリプト
manga_info_raw.json を読み込み、レビュー用CSVを出力する。
"""

import argparse
import csv
import json
import sys
from datetime import date

MODEL = "claude-sonnet-4-20250514"
TODAY = date.today().strftime("%Y-%m-%d")
SOURCE_LABEL = f"Claude API（{MODEL}, 取得日: {TODAY}）"

FIELDNAMES = [
    "No.",
    "作品名",
    "既刊巻数",
    "出版社",
    "連載状況",
    "要確認フラグ",
    "情報ソース",
    "備考",
]


def requires_check(confidence: str) -> str:
    return "要確認" if confidence in ("低", "中") else ""


def build_rows(raw_data: list[dict]) -> list[dict]:
    rows = []
    for i, item in enumerate(raw_data, start=1):
        rows.append(
            {
                "No.": i,
                "作品名": item.get("title", ""),
                "既刊巻数": item["volumes"] if item.get("volumes") is not None else "",
                "出版社": item.get("publisher", ""),
                "連載状況": item.get("serialization_status", "不明"),
                "要確認フラグ": requires_check(item.get("confidence", "低")),
                "情報ソース": SOURCE_LABEL,
                "備考": item.get("note", ""),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="マンガ情報CSV変換スクリプト")
    parser.add_argument("--input", required=True, help="入力JSONファイル（manga_info_raw.json）")
    parser.add_argument("--output", required=True, help="出力CSVファイル")
    parser.add_argument(
        "--sort-by-flag",
        action="store_true",
        help="要確認フラグ付きの行を先頭にまとめる",
    )
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        raw_data = json.load(f)

    rows = build_rows(raw_data)

    if args.sort_by_flag:
        rows = sorted(rows, key=lambda r: (0 if r["要確認フラグ"] == "要確認" else 1, r["No."]))

    # UTF-8 BOM付きで出力（Excelで正しく開けるように）
    with open(args.output, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    flagged = sum(1 for r in rows if r["要確認フラグ"] == "要確認")
    print(f"完了。出力ファイル: {args.output}")
    print(f"総件数: {len(rows)}  要確認: {flagged}  問題なし: {len(rows) - flagged}")


if __name__ == "__main__":
    main()
