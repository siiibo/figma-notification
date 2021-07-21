import {WebClient as SlackClient} from '@slack/web-api';
// import { GasWebClient as SlackClient } from '@hi-se/web-api'; //GAS用SlackWebClient
import express from 'express'

const app: express.Express = express();

if (process.env.NODE_ENV !== "production") require("dotenv").config();

const FIGMA_EVENT_POST_CHANNEL = "C01AQPDC9S4"; // #sysadm

const isJson = (req: express.Request) => {
  return req.is('application/json');
}

const isUrlVerification = (req: express.Request) => {
  if (isJson && req.body) {
    return (req.body.event_type === 'PING');
  } else {
    return false;
  }
}

const isEvent = (req: express.Request) => {
  if (isJson && req.body) {
    return req.body.hasOwnProperty('event_type')
  } else {
    return false;
  }
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

  if(isUrlVerification(req)) {
    return res.send('OK');
  }

  const client = slackClient();
  if (isEvent(req)){
    const event = req.body;
    handleFigmaEvent(client, event);
  }
  return res.send('OK');
});

const handleFigmaEvent = (client, event) => {
  switch(event.event_type) {
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

const handleFileCommentEvent = (client, event) => {
  let comment;
  // Figma内でメンションがあった場合、ユーザIDを名前に変更する。
  if (event.comment.some(elem => elem.hasOwnProperty('mention'))){
    comment = event.comment.map(elem => {
      if(elem.hasOwnProperty('mention')){
        const mentioned = event.mentions.filter(mention => 
          Object.values(mention).indexOf(elem.mention) > -1
        );
        const mentionedHandle = mentioned[0].handle;
        return {mention: `@${mentionedHandle}`};
      }
      return elem;
    });
  }
  // メンションがない場合のコメント
  else {
    comment = event.comment;
  }
  const url = `https://www.figma.com/file/${event.file_key}/${event.file_name}`;

  client.chat.postMessage({
    channel: FIGMA_EVENT_POST_CHANNEL,
    text: `
:figma: コメント (${event.triggered_by.handle}さん):

${comment.map(comment => Object.values(comment)).flat().join(" ")}

${url}
`
  });
}

const handleFileVersionUpdateEvent = (client, event) => {
  const url = `https://www.figma.com/file/${event.file_key}/${event.file_name}`;
  client.chat.postMessage({
    channel: FIGMA_EVENT_POST_CHANNEL,
    text: `
:figma: バージョン更新 (${event.triggered_by.handle}さん):

${url}
`
  });
}

// ポートを指定してHTTPリクエストを受け付ける。
app.use(router);
app.set('port', (process.env.PORT || 3000));
app.listen(app.get('port'), () => console.info(`Listning on port ${app.get('port')}`));
