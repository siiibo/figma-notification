# figma-notification

TypeScript + Heroku で作成している Slack Bot です。

## 機能

- Figmaファイルのバージョン更新をSlackに通知
- Figmaファイル上のコメントをSlackに通知


## 環境構築

- [ngrok](https://ngrok.com/)をインストール
  - brew cask install ngrokなど
- [heroku CLI](https://devcenter.heroku.com/ja/articles/heroku-cli)をインストール
- このリポジトリを clone して、以下実行

  ```sh
  asdf install
  asdf reshim yarn
  yarn
  ```

## 開発

### テスト環境

- figma-notificationリポジトリ上で `heroku local`を実行。localhostの5000番ポートでリクエストを受信できる
- `ngrok http 5000`で、先程のlocalhost:5000をngrok proxy 経由で露出
- [Figma APIサイト](https://www.figma.com/developers/api#webhooks_v2)上で、SiiiboチームのWebhookを登録
  - Webhook新規登録の場合はPOSTリクエスト
  - Webhook Endpoint URL更新の場合はPUTリクエスト
    
### 本番環境

## 補足

### GASへの移行について
当初figma-notificationはGoogle Apps Scriptで作成する予定だったが、[FigmaWebhookの制限](https://forum.figma.com/t/webhooks-the-character-limit-for-the-endpoint-is-not-enough/828)のため断念した。現在はHerokuで実装しているが、Heroku無料枠の信頼性の低さから上記の制限が緩和されたらGASへの移行をしたい。

以下、GASで実装する際の注意点(https://github.com/siiibo/shujinosuke より)


### TypeScriptを使ってローカルでGASの開発を行う方法

- GASはデフォルトではファイルモジュールがサポートされていない
  - ファイルを分割していてもグローバルスコープとなる
- ファイルモジュールが必要ない場合は `clasp` を利用するとTS→JSへのコンパイルを自動で行ってくれる
- ファイルモジュールを扱うにはローカルで設定する必要があり、Figma-notificationは `webpack` を利用することで実現している
  - 関連する設定ファイルは
    - [webpack.config.js](webpack.config.js)
    - [tsconfig.json](tsconfig.json)
- デプロイまでの流れは以下の通り
  - `webpack` でビルド
  - `clasp push` でコードをGAS環境にpush
  - `clasp deploy -i <deploymentID>` でデプロイの更新
- GASプロジェクトをローカルで管理する場合、以下の２つのファイルが必要
  - [.clasp.json](.clasp.json)
    - `clasp` でpushやdeployする対象のGASプロジェクトを設定
  - [appsscript.json](appsscript.json)
    - ランタイムやタイムゾーンなど、GAS側で必要な情報の設定
    - ブラウザ上で新規プロジェクトを作成する場合は自動で作成される
      - 初期設定ではオンラインエディタ上に表示されないようになっているが変更することで表示可能

### SlackのWebClientについて

- SlackのWebClientには [@slack/web-api](https://github.com/slackapi/node-slack-sdk)という公式ツールがある
- しかしGASはNode.jsと完全な互換性はないので上記ツールを利用することができない
- 上記ツールにはTypeScriptで開発する上で便利な情報が定義されているため、これをGASでも利用できるようにした
  - リンクは[hi-se/node-slack-sdk](https://github.com/hi-se/node-slack-sdk)
  - `https://gitpkg.now.sh/`を利用して `yarn install` している
