const express = require("express");
const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,      // any secret word you choose
  IG_TOKEN,          // Instagram access token
  IG_ID,             // your Instagram account ID
  KEYWORD = "LINK",  // word people comment
  FINAL_TEXT = "Thanks for following! 🎉 Here is your link:", // your text
  FINAL_LINK,        // link behind the button
  PORT = 3000,
} = process.env;

const API = "https://graph.instagram.com/v21.0";

async function send(recipient, message) {
  const res = await fetch(`${API}/${IG_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IG_TOKEN}`,
    },
    body: JSON.stringify({ recipient, message }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Send error:", JSON.stringify(data));
  return data;
}

// Text + "Open link" button
async function sendLinkButton(userId) {
  return send(
    { id: userId },
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: FINAL_TEXT,
          buttons: [
            { type: "web_url", url: FINAL_LINK, title: "Open link" },
          ],
        },
      },
    }
  );
}

async function isFollowing(userId) {
  const res = await fetch(
    `${API}/${userId}?fields=is_user_follow_business&access_token=${IG_TOKEN}`
  );
  const data = await res.json();
  return data.is_user_follow_business === true;
}

// Meta checks your server here (one time)
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // answer Meta immediately

  try {
    for (const entry of req.body.entry || []) {
      // 1) Someone comments the keyword
      for (const change of entry.changes || []) {
        if (change.field !== "comments") continue;
        const c = change.value;
        if (c.from?.id === IG_ID) continue; // ignore your own comments
        if (!c.text || !c.text.toUpperCase().includes(KEYWORD.toUpperCase())) continue;

        await send(
          { comment_id: c.id },
          {
            text:
              "Hey! 👋 To get the link, follow this account first, then reply to this message with any text (for example: DONE).",
          }
        );
      }

      // 2) Someone replies in the DM
      for (const m of entry.messaging || []) {
        if (!m.message || m.message.is_echo) continue;
        const userId = m.sender.id;

        if (await isFollowing(userId)) {
          await sendLinkButton(userId);
        } else {
          await send(
            { id: userId },
            {
              text: "I don't see your follow yet 🙈 Follow the account, then tap the button.",
              quick_replies: [
                { content_type: "text", title: "I followed ✅", payload: "CHECK_FOLLOW" },
              ],
            }
          );
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
