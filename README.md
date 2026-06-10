# ゆうチューブライブ

YouTube Live のコメントを使った視聴者参加型「ヒット＆ブロー」言葉当てゲームです。

## 画面

- `/` OBS Browser Source 向け 1280x720 横固定メイン画面
- `/ranking` 日間・月間ランキング
- `/admin` 管理画面とライブ風テスト機能

## ライブ風テスト機能

管理画面の「通常テスト」「コメント急増」「正解演出テスト」で、実際の YouTube Live コメントが流れているような複数ユーザーの回答を自動投入できます。VOICEVOX や YouTube Data API 接続前でも、回答履歴・ランキング・赤い○・花びら・花火の正解演出を確認できます。

## 開発コマンド

```bash
npm run build
npm start
npm test
```
