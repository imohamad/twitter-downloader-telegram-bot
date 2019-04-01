require("dotenv").config();
const Twitt = require("twitter");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

//set directory name for "users.json" file
const dir = `${__dirname}/statistics`;

//create directory
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

let usersList = [];

fs.writeFile(`${dir}/users.json`, JSON.stringify(usersList), error => {
  if (error) throw error;
});

const isTwitterUrl = /https?:\/\/twitter.com\/[0-9-a-zA-Z_]{1,20}\/status\/([0-9]*)/;
let mediaUrl;
let msgId;
let twitt;
let btn;

//twitter API and telegram bot config
const botOpts = {
  polling: true
};

const bot = new TelegramBot(process.env.TOKEN, botOpts);

const twitter = new Twitt({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

console.log("running bot...");

//handle any message without twitter url
bot.on("message", msg => {
  const chatId = msg.chat.id;
  if (!isTwitterUrl.test(msg.text)) {
    bot.sendMessage(
      chatId,
      `🔔 Please send me link of a tweet \n which contains video.`
    );
  }
});

//add user to users.json whene send "/start" to bot
bot.onText(/\/start/, (msg, match) => {
  const id = msg.from.id;
  const name = msg.from.first_name;
  const username = msg.from.username;

  fs.readFile(`${dir}/users.json`, (error, usersData) => {
    if (error) throw error;

    let users = JSON.parse(usersData);
    if (users.length) {
      const userFound = users.find(user => user.id == id);

      if (!userFound) {
        const newUser = {
          id: id,
          name: name,
          username: username
        };
        addUser(newUser);
      }
    } else {
      const newUser = {
        id: id,
        name: name,
        username: username
      };
      addUser(newUser);
    }
  });
});

//add user to "users.json" file
function addUser(user) {
  usersList.push(user);
  fs.writeFile(`${dir}/users.json`, JSON.stringify(usersList), error => {
    if (error) throw error;
  });
}

//handle select quality with callback query
bot.on("callback_query", query => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const qmsgId = query.message.message_id;
  quality = mediaUrl.filter(file => file.url.includes(data));

  if (quality.length) {
    let qualityBtn = [];
    let btnIcon;
    mediaUrl.forEach(file => {
      if (
        (file.url.includes("amplify_video") &&
          file.url.split("/")[6] == data) ||
        file.url.split("/")[7] == data
      ) {
        btnIcon = "✅";
      } else {
        btnIcon = "🎞";
      }
      qualityBtn.push([
        {
          text: `${btnIcon} Quality ${
            file.url.includes("amplify_video")
              ? file.url.split("/")[6]
              : file.url.split("/")[7]
          }`,
          callback_data: file.url.includes("amplify_video")
            ? file.url.split("/")[6]
            : file.url.split("/")[7]
        }
      ]);
    });

    //set caption for video message and show inline keyboard
    const options = {
      caption: `👤 ${twitt.user.name}\n ❤️ Like: ${
        twitt.favorite_count
      }\n 🔁 Retweet: ${
        twitt.retweet_count
      }\n 📹 Quality: ${data}\n --- \n 🆔 @TwitterDownloaderBot`,
      reply_to_message_id: msgId,
      reply_markup: {
        inline_keyboard: qualityBtn
      }
    };

    bot.sendVideo(chatId, quality[0].url, options).then(done => {
        bot.deleteMessage(chatId, qmsgId).catch(error => console.log(error.message));
      }).catch(error => {
        //show error for available quaity
        bot.sendMessage(
            chatId,
            "⚠️ Sorry, The quality of this video is not available now, please choose another quality.",
            {
              reply_to_message_id: msgId,
              reply_markup: {
                inline_keyboard: qualityBtn
              }
            }
          ).then(done => {
            bot.deleteMessage(chatId, qmsgId).catch(error => console.log(error.message));
          }).catch(error => console.log(error.message));
      });
  } else {
    bot.deleteMessage(chatId, qmsgId).catch(error => console.log(error.message));
  }
});

bot.onText(isTwitterUrl, (msg, match) => {
  const chatId = msg.chat.id;
  const twittId = match[1];
  msgId = msg.message_id;

  //set processing message for user
  bot.sendMessage(chatId, "⏳ Processing...", { reply_to_message_id: msgId })
    .then(result => {
      //send require data for get video
      const botMsgId = result.message_id;
      getVideo(chatId, twittId, msgId, botMsgId);
    });
});

//get video from twitt
function getVideo(chatId, twittId, msgId, botMsgId) {
  //set extended mode for return media from request
  const twittOpts = {
    tweet_mode: "extended"
  };

  //send request to twitter
  twitter.get(`statuses/show/${twittId}`, twittOpts, (error, twittData, response) => {
      if (error) {
        bot.sendMessage(chatId, "⚠️ Sorry, Something went wrong.")
        .catch(error => console.log(error.message));
      } else {
        //does tweets have video?
        if (
          twittData.extended_entities &&
          twittData.extended_entities.media[0].type == "video"
        ) {
          mediaUrl = twittData.extended_entities.media[0].video_info.variants.filter(
            file => file.content_type == "video/mp4"
          );
          twitt = twittData;
          btn = [];
          mediaUrl.forEach(file => {
            btn.push([
              {
                text: `🎞 Quality ${
                  file.url.includes("amplify_video")
                    ? file.url.split("/")[6]
                    : file.url.split("/")[7]
                }`,
                callback_data: file.url.includes("amplify_video")
                  ? file.url.split("/")[6]
                  : file.url.split("/")[7]
              }
            ]);
          });

          //edit message to "chose a quality" and show inline keyboard
          bot.editMessageText("⬇️ Choose a quality...", {
              chat_id: chatId,
              message_id: botMsgId,
              reply_markup: {
                inline_keyboard: btn
              }
            }).catch(error => console.log(error.message));
        } else {
          bot.editMessageText(
              `❌ There is no video in this tweet. \n🔔 Please send me the link of a tweet \n which contains video.`,
              {
                chat_id: chatId,
                message_id: botMsgId
              }
            ).catch(error => console.log(error.message));
        }
      }
    }
  );
}
