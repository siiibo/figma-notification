import { WebClient as SlackClient } from '@slack/web-api';
// import { GasWebClient as SlackClient } from '@hi-se/web-api'; //GAS用SlackWebClient
import express from 'express'
import fetch from 'node-fetch'

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
ここでの基準は二つのパラメータの値の差が30秒以下。
*/
const isFirstRequest = (event) => {
  if (event.retries === 0) {
    return new Date(event.timestamp).getTime() - new Date(event.created_at).getTime() < 30000;
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

const getTrelloAuthInfo = () => {
  return {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_TOKEN
  }
}

// コメントがTrelloカードリンクを含むかを判定する関数
const includesTrelloCardId = (text) => {
  return text.includes("trello.com/c/");
}

// コメントからTrelloカードIDを抽出する関数
const extractTrelloCardIdsFromComment = (text) => {
  const trelloCardIds = text
    .split(/(?=trello.com\/c\/)/g)
    .filter(elem => elem.includes("trello.com/c/"))
    .map(elem => elem.match(/(?<=(trello.com\/c\/))[0-9A-Za-z]+/g))
    .flat();
  return Array.from(new Set(trelloCardIds));
}

// Trello APIを通じて、指定のカードにFigmaファイルへのURLを添付
const attachFigmaFileToTrelloCard = async (cardId, figmaCommentUrl, figmaFileName) => {
  const url = `https://api.trello.com/1/cards/${cardId}/attachments`;
  const options = {
    method: "post",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...getTrelloAuthInfo(),
      name: figmaFileName,
      url: figmaCommentUrl
    })
  };
  return fetch(url, options);
}

// TrelloカードURLをSlack表示用に短縮する。
const shortenTrelloUrls = (text: String): String => {
  const fullUrlRegExp = new RegExp("https://trello\.com/c/[0-9A-Za-z]+(/[a-zA-Z0-9.?,'/\\+&%$#_-]+)?", "g");
  const fullUrls = text.match(fullUrlRegExp);
  const uniqFullUrls = new Set(fullUrls)
  uniqFullUrls.forEach(fullUrl => text = text.replace(new RegExp(fullUrl, "g"), `<${fullUrl} | ${fullUrl.match(new RegExp("https://trello\.com/c/[0-9A-Za-z]+", "g"))[0]}>`));
  return text;
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

const handleFileCommentEvent = async (client, event) => {
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
  const joinedComment = comment.map(comment => Object.values(comment)).flat().join(" ");
  const terseComment = includesTrelloCardId(joinedComment) ? shortenTrelloUrls(joinedComment) : joinedComment;

  client.chat.postMessage({
    channel: FIGMA_EVENT_POST_CHANNEL,
    attachments: [
      {
        author_name: `${event.triggered_by.handle}`,
        fallback: `${event.triggered_by.handle}:\n\n${terseComment}\n\n<${url}|*${event.file_name}*>`,
        text: terseComment,
        pretext: `New comment on <${url}|*${event.file_name}*>`,
      }
    ]
  });

  // trelloカードのリンクを含む場合、trelloで相互リンクを形成する
  if (includesTrelloCardId(joinedComment)) {
    const trelloCardIds = extractTrelloCardIdsFromComment(joinedComment);
    const responses = await Promise.all(trelloCardIds.map(async trelloCardId => {
      return await attachFigmaFileToTrelloCard(trelloCardId, url, event.file_name);
    }));
    console.info(`[trello api results]\n\n${JSON.stringify(responses)}`);
  }
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
