import { WebClient as SlackClient } from '@slack/web-api';
// import { GasWebClient as SlackClient } from '@hi-se/web-api'; //GAS用SlackWebClient
import express from 'express'

const app: express.Express = express();

if (process.env.NODE_ENV !== "production") require("dotenv").config();

const FIGMA_EVENT_POST_CHANNEL = "C01AQPDC9S4"; // #sysadm
//const FIGMA_EVENT_POST_CHANNEL = "CKPHC6M43"; // #design-portal

const isUrlVerification = (req: express.Request) => {
  if (req.body) {
    return (req.body.event_type === 'PING');
  } else {
    return false;
  }
}

const isEvent = (req: express.Request) => {
  if (req.body) {
    return req.body.hasOwnProperty('event_type')
  } else {
    return false;
  }
}

/*
Figma Webhookでは時間差でretriesが0の複数のリクエストを送ってくることあるため、
イベント発生時間とタイムスタンプの時間差を元に処理の継続を判断する。
ここでの基準は二つのパラメータの値の差が5秒以下。
*/
const isFirstRequest = (event) => {
  if (event.retries === 0) {
    return new Date(event.timestamp).getTime() - new Date(event.created_at).getTime() < 5000;
  } else {
    return false;
  }
}

// リトライ判定用関数
// Heroku Free Dynoとの相性が悪く、連投の原因となるため使用しない
const isRetry = (event) => {
  return (event.retries > 0);
}

const createUrl = (event) => {
  let url = "";
  switch (event.event_type) {
    case 'FILE_COMMENT':
      url = `https://www.figma.com/file/${event.file_key}#${event.comment_id}`
      break;
    case 'FILE_VERSION_UPDATE':
      const file_name = event.file_name.replace(/\s+/g, '-');
      url = `https://www.figma.com/file/${event.file_key}/${file_name}`
      break;
  }
  return url;
}

const slackClient = () => {
  const token = process.env.BOT_TOKEN;
  return new SlackClient(token);
}


/* 
Figma Webhookのリクエストをexpressを利用して処理。
GASのdoPost関数に相当。
*/

// body-parserに基づいた着信リクエストの解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const router: express.Router = express.Router()
app.post('/', (req: express.Request, res: express.Response) => {
  console.info(`[doPost raw event]\n\n${JSON.stringify(req.body)}`);

  if (isUrlVerification(req)) {
    return res.send('OK');
  }

  const client = slackClient();
  if (isEvent(req)) {
    const event = req.body;
    handleFigmaEvent(client, event);
  }
  return res.send('OK');
});

const handleFigmaEvent = (client, event) => {
  if (isFirstRequest(event)) {
    switch (event.event_type) {
      case 'FILE_COMMENT':
        console.info(`FILE_COMMENT event`);
        handleFileCommentEvent(client, event);
        break;
      case 'FILE_VERSION_UPDATE':
        console.info(`FILE_VERSION_UPDATE event`);
        handleFileVersionUpdateEvent(client, event);
        break;
    }
  }
}

const handleFileCommentEvent = (client, event) => {
  let comment;
  // Figma内でメンションがあった場合、ユーザIDを名前に置換する。
  if (event.comment.some(elem => elem.hasOwnProperty('mention'))) {
    comment = event.comment.map(elem => {
      if (elem.hasOwnProperty('mention')) {
        const mentioned = event.mentions.filter(mention =>
          Object.values(mention).indexOf(elem.mention) > -1
        );
        const mentionedHandle = mentioned[0].handle;
        return { mention: `@${mentionedHandle}` };
      }
      return elem;
    });
  }
  else {
    // メンションがない場合のコメント
    comment = event.comment;
  }
  const url = createUrl(event);

  client.chat.postMessage({
    channel: FIGMA_EVENT_POST_CHANNEL,
    attachments: [
      {
        author_name: `${event.triggered_by.handle}`,
        fallback: `${event.triggered_by.handle}:\n\n${comment.map(comment => Object.values(comment)).flat().join(" ")}\n\n<${url}|*${event.file_name}*>`,
        text: `${comment.map(comment => Object.values(comment)).flat().join(" ")}`,
        pretext: `New comment on <${url}|*${event.file_name}*>`,
      }
    ]
  });
}

const handleFileVersionUpdateEvent = (client, event) => {
  const url = createUrl(event);
  client.chat.postMessage({
    channel: FIGMA_EVENT_POST_CHANNEL,
    attachments: [
      {
        fallback: `バージョン更新（${event.triggered_by.handle})：\n\n<${url}|*${event.file_name}*>`,
        text: `<${url}|*${event.file_name}*>のバージョンが更新されました！`,
        pretext: `File version updated by *${event.triggered_by.handle}*`,
        color: "#3399ff"
      }
    ]
  });
}

// ポートを指定してHTTPリクエストを受け付ける。
app.use(router);
app.set('port', (process.env.PORT || 3000));
app.listen(app.get('port'), () => console.info(`Listning on port ${app.get('port')}`));
