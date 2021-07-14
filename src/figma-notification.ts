import {WebClient as SlackClient} from '@slack/web-api';
import express from 'express'

const app: express.Express = express();

// CORSの許可
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
});

// body-parserに基づいた着信リクエストの解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") require("dotenv").config();

const FIGMA_EVENT_POST_CHANNEL = "C01AQPDC9S4" // #sysadm

const isJson = (req) => {
  return req.is('application/json');
}

const isUrlVerification = (req) => {
  if (isJson && req.body) {
    return (req.body.event_type === 'PING');
  } else {
    return false;
  }
}

const slackClient = () => {
  const token = process.env.BOT_TOKEN;
  return new SlackClient(token);
}


// Figmaのpayloadの処理
const router: express.Router = express.Router()
app.post('/', (req:express.Request, res:express.Response) => {
  console.info(`[doPost raw event]\n\n${JSON.stringify(req.body)}`);

  if(isUrlVerification(req)) {
    return res.send(req.body.passcode);
  }

  const client = slackClient();
  if(req.body.event_type === "FILE_COMMENT") {
    const body = req.body;
    client.chat.postMessage( {
      channel: FIGMA_EVENT_POST_CHANNEL,
      text: `
${body.file_name}ファイルで${body.triggered_by.handle}さんよりコメントがありました。
${body.comment.map(element => element.text).join("\n")}
            `
    })
    return res.send('OK')
  }
});
app.use(router)

app.listen(3000,()=>{ console.log('Example app listening on port 3000!') })
