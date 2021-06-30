import { GasWebClient as SlackClient } from '@hi-se/web-api';

const TOKEN_SHEET_ID = '1ExiQonKpf2T8NnR9YFMzoD7jobHEuAXUUq3vaBL0hW8';
const FIGMA_EVENT_POST_CHANNEL = "C01AQPDC9S4" // #sysadm

/*
Webhookの送信元は現段階ではFigmaのみ
まずはfigmaWebhookを受け取れるように設定を行う必要がある。
それが終わったらGASの設定を行っていく。
実はSlackのイベントは飛んでくる可能性は低く、特にboldをimportする必要はなさそう。
Figmaからの通知が即時通知が必要なものであればpostMessageで内容をそのまま送信する。
*/

const isJson = (e: GoogleAppsScript.Events.DoPost) => {
  return e.postData.type === 'application/json';
}

const isUrlVerification = (e: GoogleAppsScript.Events.DoPost) => {
  if (isJson(e) && e.postData.contents) {
    return (JSON.parse(e.postData.contents).type === 'url_verification');
  } else {
    return false;
  }
}

const init = () => {
  const sheet = SpreadsheetApp.openById(TOKEN_SHEET_ID).getSheets()[0];
  const row = sheet.getRange('A:A').createTextFinder('figma-notification').findNext().getRow();
  const column = sheet.getRange(1, 1, 1, sheet.getLastColumn()).createTextFinder('Token').findNext().getColumn();
  const slackToken = sheet.getRange(row, column).getValue();
  PropertiesService.getScriptProperties().setProperty('SLACK_TOKEN', slackToken);
}

const getSlackClient = () => {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_TOKEN');
  return new SlackClient(token);
}


const doPost = (e: GoogleAppsScript.Events.DoPost) => {
  console.info(`[doPost raw event]\n\n${JSON.stringify(e)}`);
  if (isUrlVerification(e)) {
    return ContentService.createTextOutput(JSON.parse(e.postData.contents)['challenge']);
  }

  const client = getSlackClient();
  return ContentService.createTextOutput('OK');
}


declare const global: any;
global.doPost = doPost;
global.init = init;
