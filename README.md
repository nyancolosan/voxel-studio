# ボクセル工房（voxel-studio）

スマホで使える、自分専用のボクセルキャラ作成アプリ。作ったキャラは骨組みと6種類のアニメ（待機・歩く・走る・攻撃・座る・寝る）付きの `.glb` として書き出し、ゲームで使う。

- 公開版：claude.ai のアーティファクト（`dist/voxel_studio.html`）
- 作業ルール：[AGENTS.md](AGENTS.md)
- 現状と未確認の点：[docs/HANDOFF.md](docs/HANDOFF.md)

```
python3 tools/build.py        # dist/voxel_studio.html を作る
node tests/export_test.mjs    # 書き出しのテスト
node tests/edit_test.cjs      # 編集ロジックのテスト
```
