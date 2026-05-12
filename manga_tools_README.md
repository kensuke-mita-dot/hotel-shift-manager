# マンガ情報取得ツール

1,706件のマンガタイトルから巻数・出版社・連載状況を自動取得し、レビュー用CSVを出力するツール。

## セットアップ

```bash
pip install -U anthropic
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 使い方

### ステップ1: 情報取得（全1,706件）

```bash
python fetch_manga_info.py --input manga_list.csv --output manga_info_raw.json
```

- 25件ずつバッチ処理（バッチ間2秒スリープ）
- 全件処理には 2〜3時間かかる想定
- 途中で止まっても再実行すると **処理済みをスキップして再開**

#### テスト実行（件数を絞る）

```bash
python fetch_manga_info.py --input manga_list.csv --output manga_info_raw.json --limit 50
```

### ステップ2: CSV変換

```bash
python build_output_csv.py --input manga_info_raw.json --output manga_list_enriched.csv
```

要確認フラグ付きの行を先頭にまとめたい場合:

```bash
python build_output_csv.py --input manga_info_raw.json --output manga_list_enriched.csv --sort-by-flag
```

## 出力ファイル

| ファイル | 説明 |
|---|---|
| `manga_info_raw.json` | API取得の生データ（中間ファイル） |
| `manga_list_enriched.csv` | レビュー用CSV（UTF-8 BOM付き、Excelで開ける） |

### CSVの列

| 列名 | 内容 |
|---|---|
| No. | 元リストの番号 |
| 作品名 | 元のタイトル |
| 既刊巻数 | 巻数（不明は空白） |
| 出版社 | 出版社名 |
| 連載状況 | 連載中 / 完結 / 休載中 / 不明 |
| 要確認フラグ | confidence が「低」または「中」の場合「要確認」 |
| 情報ソース | 取得に使用したモデルと日付 |
| 備考 | カラー版・外伝・取得失敗等 |

## 信頼度（confidence）の基準

| 値 | 意味 |
|---|---|
| 高 | メジャータイトルで出版社・巻数が確実 |
| 中 | 概ね正しいが巻数が変動中、またはやや認知度が低い |
| 低 | マイナータイトル、情報不足、取得失敗、特殊ケース |

confidence「低」または「中」はすべて「要確認」フラグが付きます。

## 入力ファイル仕様

`manga_list.csv`

- エンコーディング: UTF-8 BOM付き（utf-8-sig）
- 必須列: `No.`、`正式な作品名`
