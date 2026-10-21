# 銘柄分析ショート動画(個人用)

決算の数字を `data/*.json` に置き、台本テンプレートから MulmoScript とスライドを組み立てて、
アバター「メグ」が話す1分の縦動画(1080×1920)を MulmoCast で作ります。

```
data/nintendo_fy27q1.json              数字(ここだけに書く)
script/nintendo_fy27q1.template.json   台本テンプレート({{sales}} などで数字を参照)
lib/                                   組み立て・スライド描画・検証
out/                                   生成物(git 管理外)
  nintendo_fy27q1.mulmo.json           MulmoScript
  speech.json                          VOICEVOX に読ませるテキスト(場面ごと)
  slides/*.svg, *.png                  表・グラフのスライド
  audio/<n>_<id>.wav                   VOICEVOX の音声(置くと台本に差し込まれる)
avatar/meg/                            Mesh Avatar Studio のプロジェクト(置くと話者に付く)
```

## 使い方

```sh
export CHROME_PATH=/path/to/chrome   # スライド SVG を PNG にするため
npm run build    # data + テンプレート -> out/
npm run verify   # out/ の数字がすべて data と一致するか確認(--strict で警告も失敗扱い)
npm test
npx mulmo movie out/nintendo_fy27q1.mulmo.json   # 動画化(mulmocast 2.19 以降)
```

## テンプレートの書き方

- `{{key}}` は `data.figures.key` を表示形式にしたもの(例: `5,178億円`、`-9.5%`、`約2.5倍`)。
- `{{key|abs}}` は符号なし(「9.5%減りました」のように向きを言葉で言うとき)。
- `{{@company}}` `{{@period}}` `{{@months}}` `{{@announcedAt}}` は data のメタ情報。
- `readings` は VOICEVOX が読み間違える語の読み(例: `Switch 2` → `スイッチツー`)。画面と口パク合わせには元の表記を使います。

## 検証(npm run verify)が見ること

1. テンプレートに手書きの数字がない(許可するのは `lib/verify.mjs` の `LITERAL_NUMBERS` だけ: 「1分」「4月から6月」「Switch 2」)
2. 生成された台本・スライド(SVG の文字)の数字が、すべて data の値の表示と一致する
3. 生成物が今の data から作られている(data を直して build し忘れたら失敗)
4. VOICEVOX 用テキストが台本と同じ(読み替えた語以外)
5. 計算で出せる数字(営業利益率、約2.5倍、進捗率、前年同期の営業利益率)が元の数字と合う
6. 「買い」「売り」などの投資判断の言葉がない

## MulmoCast まわりのメモ

- VOICEVOX は MulmoCast の TTS に含まれないので、各場面の `audio`(`type: "audio"`)に wav を指定します。OpenAI のキーは不要です。
- アバターは `speechParams.speakers.Meg.avatar.source` に Mesh Avatar Studio のプロジェクトを指定すると、口パク付きで重なります。口の動きは台本の文字と音声の強制アライメントで合わせます(`npm i avatarscript onnxruntime-node`、初回に Hugging Face からモデル 635MB をダウンロード)。
- MulmoCast の `svg` 画像タイプは描画処理がないため、SVG は Chromium で PNG にして `image` タイプで渡しています。
- root で動かす Chromium には `--no-sandbox` が必要です。MulmoCast は `CI=true` のときに付けます。
